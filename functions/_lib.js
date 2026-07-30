// ----------------------------------------------------------------------------
// 共享库：业务逻辑 + Cloudflare KV 存储
// 该文件以下划线开头，Cloudflare Pages 不会把它当作路由，仅供其他函数 import。
// ----------------------------------------------------------------------------

// 默认后台密码（生产环境务必通过 Cloudflare 变量 ADMIN_PASSWORD 覆盖）
export const DEFAULT_ADMIN_PASSWORD = 'admin888';
const KV_KEY = 'numbers';
const SETTINGS_KEY = 'settings';

// 站点设置默认值（后台「站点设置」可覆盖：主题色/客服/Banner/公告等）
export const DEFAULT_SETTINGS = {
  siteName: '上海成霞通讯选号系统',
  logoText: '成',
  contactQrUrl: '',     // 客服微信二维码图片 URL
  contactPhone: '',     // 客服电话
  contactWechat: '',    // 客服微信号
  banners: [],          // Banner 轮播图 URL 数组，空则用默认渐变 Banner
  themeColor: '#e4393c',// 主题色（注入 CSS 变量 --theme）
  noticeText: '平台担保交易，安全无忧', // 滚动公告，多条用换行分隔
};

// ---- 响应助手 ----
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      ...headers,
    },
  });
}

export function error(status, code, detail) {
  return json({ title: code, status, detail }, status);
}

// ---- 鉴权（无状态：token = sha256(ADMIN_PASSWORD)）----
export async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getAdminPassword(env) {
  return (env && env.ADMIN_PASSWORD) || DEFAULT_ADMIN_PASSWORD;
}

export async function expectedToken(env) {
  return sha256Hex(getAdminPassword(env));
}

export async function authenticate(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  return token === (await expectedToken(env));
}

// ---- 号码工具（与 server.js 保持一致）----
export function detectOperator(number) {
  const seg = number.slice(0, 3);
  const two = number.slice(0, 2);
  if (['13', '15', '18', '14', '17', '16', '19'].includes(two)) {
    if (['162', '165', '167', '170', '171'].includes(seg)) return '虚拟运营商';
    if (['134', '135', '136', '137', '138', '139', '147', '150', '151', '152', '157', '158', '159', '172', '178', '182', '183', '184', '187', '188', '198'].includes(seg)) return '移动';
    if (['130', '131', '132', '145', '155', '156', '166', '175', '176', '185', '186', '196'].includes(seg)) return '联通';
    if (['133', '149', '153', '173', '174', '177', '180', '181', '189', '199'].includes(seg)) return '电信';
  }
  return '未知';
}

export function classifyNumber(number) {
  const digits = number.split('').map(Number);
  const last = number[number.length - 1];
  // 尾部连续相同位数（用于识别尾号 3 连 / 4 连）
  let run = 1;
  for (let i = number.length - 2; i >= 0; i--) {
    if (number[i] === number[i + 1]) run++;
    else break;
  }
  const tail = number.slice(-4);

  if (run >= 4) return { level: '靓号', tag: '尾号4连' };
  if (run === 3) return { level: '靓号', tag: '尾号3连' };
  if (tail[0] === tail[1] && tail[2] === tail[3] && tail[0] !== tail[2]) return { level: '靓号', tag: '对子号' };
  if (tail[0] === tail[2] && tail[1] === tail[3] && tail[0] !== tail[1]) return { level: '靓号', tag: '循环号' };
  if (digits.slice(-4).every((d, i, a) => i === 0 || d === a[i - 1] + 1)) return { level: '靓号', tag: '顺子号' };
  if (digits.slice(-4).every((d, i, a) => i === 0 || d === a[i - 1] - 1)) return { level: '靓号', tag: '倒顺号' };
  if (number.includes('888')) return { level: '靓号', tag: '含888' };
  if (number.includes('666')) return { level: '靓号', tag: '含666' };
  return { level: '普通号', tag: '普通号' };
}

export function normalizeNumber(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 11 || !digits.startsWith('1')) return null;
  return digits;
}

export function genId() {
  const u = (typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : String(Math.random());
  return 'n_' + u.replace(/-/g, '').slice(0, 12);
}

// ---- 站点设置读写 ----
export async function getSettings(env) {
  const kv = env && env.NUMBERS_KV;
  if (!kv) return { ...DEFAULT_SETTINGS };
  const raw = await kv.get(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const obj = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...obj };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(env, patch) {
  const kv = env && env.NUMBERS_KV;
  if (!kv) throw new Error('KV_NOT_BOUND');
  const cur = await getSettings(env);
  const next = { ...cur, ...patch };
  await kv.put(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// ---- KV 存储（整个数组存一个 key；KV 跨部署持久，不会因重部署丢失）----
export async function readAll(env) {
  const kv = env && env.NUMBERS_KV;
  if (!kv) throw new Error('KV_NOT_BOUND');
  const raw = await kv.get(KV_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? dedupe(arr) : [];
  } catch {
    return [];
  }
}

export async function writeAll(env, items) {
  const kv = env && env.NUMBERS_KV;
  if (!kv) throw new Error('KV_NOT_BOUND');
  await kv.put(KV_KEY, JSON.stringify(items));
}

// 按手机号去重（保留最早一条），避免种子并发导致的重复
export function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it || !it.number || seen.has(it.number)) continue;
    seen.add(it.number);
    out.push(it);
  }
  return out;
}

// 号码归属地（按号段前 7 位粗略归类，仅展示用）
const NUMBER_LOCATIONS = {
  '1700': ['北京', '北京'], '1701': ['广东', '深圳'], '1702': ['上海', '上海'], '1703': ['北京', '北京'],
  '1705': ['江苏', '南京'], '1706': ['广东', '广州'], '1707': ['广东', '深圳'], '1708': ['北京', '北京'],
  '1709': ['上海', '上海'], '1710': ['北京', '北京'], '1711': ['北京', '北京'], '1715': ['广东', '广州'],
  '1716': ['广东', '深圳'], '1717': ['广东', '深圳'], '1718': ['北京', '北京'], '1719': ['北京', '北京'],
  '1310': ['北京', '北京'], '1311': ['北京', '北京'], '1312': ['河北', '石家庄'], '1313': ['河北', '石家庄'],
  '1314': ['河北', '石家庄'], '1315': ['河北', '石家庄'], '1316': ['河北', '石家庄'], '1317': ['河北', '石家庄'],
  '1318': ['河北', '石家庄'], '1319': ['河北', '石家庄'],
  '1320': ['北京', '北京'], '1321': ['北京', '北京'], '1322': ['北京', '北京'], '1323': ['北京', '北京'],
  '1324': ['北京', '北京'], '1325': ['北京', '北京'], '1326': ['北京', '北京'], '1327': ['北京', '北京'],
  '1328': ['北京', '北京'], '1329': ['北京', '北京'],
  '1330': ['北京', '北京'], '1331': ['北京', '北京'], '1332': ['北京', '北京'], '1333': ['北京', '北京'],
  '1334': ['北京', '北京'], '1335': ['北京', '北京'], '1336': ['北京', '北京'], '1337': ['北京', '北京'],
  '1338': ['北京', '北京'], '1339': ['北京', '北京'],
  '1340': ['北京', '北京'], '1341': ['北京', '北京'], '1342': ['北京', '北京'], '1343': ['北京', '北京'],
  '1344': ['北京', '北京'], '1345': ['北京', '北京'], '1346': ['北京', '北京'], '1347': ['北京', '北京'],
  '1348': ['北京', '北京'], '1349': ['北京', '北京'],
  '1350': ['北京', '北京'], '1351': ['北京', '北京'], '1352': ['北京', '北京'], '1353': ['北京', '北京'],
  '1354': ['北京', '北京'], '1355': ['北京', '北京'], '1356': ['北京', '北京'], '1357': ['北京', '北京'],
  '1358': ['北京', '北京'], '1359': ['北京', '北京'],
  '1360': ['北京', '北京'], '1361': ['北京', '北京'], '1362': ['北京', '北京'], '1363': ['北京', '北京'],
  '1364': ['北京', '北京'], '1365': ['北京', '北京'], '1366': ['北京', '北京'], '1367': ['北京', '北京'],
  '1368': ['北京', '北京'], '1369': ['北京', '北京'],
  '1370': ['北京', '北京'], '1371': ['北京', '北京'], '1372': ['北京', '北京'], '1373': ['北京', '北京'],
  '1374': ['北京', '北京'], '1375': ['北京', '北京'], '1376': ['北京', '北京'], '1377': ['北京', '北京'],
  '1378': ['北京', '北京'], '1379': ['北京', '北京'],
  '1380': ['北京', '北京'], '1381': ['北京', '北京'], '1382': ['北京', '北京'], '1383': ['北京', '北京'],
  '1384': ['北京', '北京'], '1385': ['北京', '北京'], '1386': ['北京', '北京'], '1387': ['北京', '北京'],
  '1388': ['北京', '北京'], '1389': ['北京', '北京'],
  '1390': ['北京', '北京'], '1391': ['北京', '北京'], '1392': ['北京', '北京'], '1393': ['北京', '北京'],
  '1394': ['北京', '北京'], '1395': ['北京', '北京'], '1396': ['北京', '北京'], '1397': ['北京', '北京'],
  '1398': ['北京', '北京'], '1399': ['北京', '北京'],
  '1500': ['北京', '北京'], '1501': ['北京', '北京'], '1502': ['北京', '北京'], '1503': ['北京', '北京'],
  '1504': ['北京', '北京'], '1505': ['北京', '北京'], '1506': ['北京', '北京'], '1507': ['北京', '北京'],
  '1508': ['北京', '北京'], '1509': ['北京', '北京'],
  '1510': ['北京', '北京'], '1511': ['北京', '北京'], '1512': ['北京', '北京'], '1513': ['北京', '北京'],
  '1514': ['北京', '北京'], '1515': ['北京', '北京'], '1516': ['北京', '北京'], '1517': ['北京', '北京'],
  '1518': ['北京', '北京'], '1519': ['北京', '北京'],
  '1520': ['北京', '北京'], '1521': ['北京', '北京'], '1522': ['北京', '北京'], '1523': ['北京', '北京'],
  '1524': ['北京', '北京'], '1525': ['北京', '北京'], '1526': ['北京', '北京'], '1527': ['北京', '北京'],
  '1528': ['北京', '北京'], '1529': ['北京', '北京'],
  '1550': ['北京', '北京'], '1551': ['北京', '北京'], '1552': ['北京', '北京'], '1553': ['北京', '北京'],
  '1554': ['北京', '北京'], '1555': ['北京', '北京'], '1556': ['北京', '北京'], '1557': ['北京', '北京'],
  '1558': ['北京', '北京'], '1559': ['北京', '北京'],
  '1560': ['北京', '北京'], '1561': ['北京', '北京'], '1562': ['北京', '北京'], '1563': ['北京', '北京'],
  '1564': ['北京', '北京'], '1565': ['北京', '北京'], '1566': ['北京', '北京'], '1567': ['北京', '北京'],
  '1568': ['北京', '北京'], '1569': ['北京', '北京'],
  '1570': ['北京', '北京'], '1571': ['北京', '北京'], '1572': ['北京', '北京'], '1573': ['北京', '北京'],
  '1574': ['北京', '北京'], '1575': ['北京', '北京'], '1576': ['北京', '北京'], '1577': ['北京', '北京'],
  '1578': ['北京', '北京'], '1579': ['北京', '北京'],
  '1580': ['北京', '北京'], '1581': ['北京', '北京'], '1582': ['北京', '北京'], '1583': ['北京', '北京'],
  '1584': ['北京', '北京'], '1585': ['北京', '北京'], '1586': ['北京', '北京'], '1587': ['北京', '北京'],
  '1588': ['北京', '北京'], '1589': ['北京', '北京'],
  '1590': ['北京', '北京'], '1591': ['北京', '北京'], '1592': ['北京', '北京'], '1593': ['北京', '北京'],
  '1594': ['北京', '北京'], '1595': ['北京', '北京'], '1596': ['北京', '北京'], '1597': ['北京', '北京'],
  '1598': ['北京', '北京'], '1599': ['北京', '北京'],
  '1620': ['北京', '北京'], '1621': ['北京', '北京'], '1622': ['北京', '北京'], '1623': ['北京', '北京'],
  '1624': ['北京', '北京'], '1625': ['北京', '北京'], '1626': ['北京', '北京'], '1627': ['北京', '北京'],
  '1628': ['北京', '北京'], '1629': ['北京', '北京'],
  '1650': ['北京', '北京'], '1651': ['北京', '北京'], '1652': ['北京', '北京'], '1653': ['北京', '北京'],
  '1654': ['北京', '北京'], '1655': ['北京', '北京'], '1656': ['北京', '北京'], '1657': ['北京', '北京'],
  '1658': ['北京', '北京'], '1659': ['北京', '北京'],
  '1660': ['北京', '北京'], '1661': ['北京', '北京'], '1662': ['北京', '北京'], '1663': ['北京', '北京'],
  '1664': ['北京', '北京'], '1665': ['北京', '北京'], '1666': ['北京', '北京'], '1667': ['北京', '北京'],
  '1668': ['北京', '北京'], '1669': ['北京', '北京'],
  '1670': ['北京', '北京'], '1671': ['北京', '北京'], '1672': ['北京', '北京'], '1673': ['北京', '北京'],
  '1674': ['北京', '北京'], '1675': ['北京', '北京'], '1676': ['北京', '北京'], '1677': ['北京', '北京'],
  '1678': ['北京', '北京'], '1679': ['北京', '北京'],
  '1720': ['北京', '北京'], '1721': ['北京', '北京'], '1722': ['北京', '北京'], '1723': ['北京', '北京'],
  '1724': ['北京', '北京'], '1725': ['北京', '北京'], '1726': ['北京', '北京'], '1727': ['北京', '北京'],
  '1728': ['北京', '北京'], '1729': ['北京', '北京'],
  '1730': ['北京', '北京'], '1731': ['北京', '北京'], '1732': ['北京', '北京'], '1733': ['北京', '北京'],
  '1734': ['北京', '北京'], '1735': ['北京', '北京'], '1736': ['北京', '北京'], '1737': ['北京', '北京'],
  '1738': ['北京', '北京'], '1739': ['北京', '北京'],
  '1750': ['北京', '北京'], '1751': ['北京', '北京'], '1752': ['北京', '北京'], '1753': ['北京', '北京'],
  '1754': ['北京', '北京'], '1755': ['北京', '北京'], '1756': ['北京', '北京'], '1757': ['北京', '北京'],
  '1758': ['北京', '北京'], '1759': ['北京', '北京'],
  '1760': ['北京', '北京'], '1761': ['北京', '北京'], '1762': ['北京', '北京'], '1763': ['北京', '北京'],
  '1764': ['北京', '北京'], '1765': ['北京', '北京'], '1766': ['北京', '北京'], '1767': ['北京', '北京'],
  '1768': ['北京', '北京'], '1769': ['北京', '北京'],
  '1770': ['北京', '北京'], '1771': ['北京', '北京'], '1772': ['北京', '北京'], '1773': ['北京', '北京'],
  '1774': ['北京', '北京'], '1775': ['北京', '北京'], '1776': ['北京', '北京'], '1777': ['北京', '北京'],
  '1778': ['北京', '北京'], '1779': ['北京', '北京'],
  '1780': ['北京', '北京'], '1781': ['北京', '北京'], '1782': ['北京', '北京'], '1783': ['北京', '北京'],
  '1784': ['北京', '北京'], '1785': ['北京', '北京'], '1786': ['北京', '北京'], '1787': ['北京', '北京'],
  '1788': ['北京', '北京'], '1789': ['北京', '北京'],
  '1800': ['北京', '北京'], '1801': ['北京', '北京'], '1802': ['北京', '北京'], '1803': ['北京', '北京'],
  '1804': ['北京', '北京'], '1805': ['北京', '北京'], '1806': ['北京', '北京'], '1807': ['北京', '北京'],
  '1808': ['北京', '北京'], '1809': ['北京', '北京'],
  '1810': ['北京', '北京'], '1811': ['北京', '北京'], '1812': ['北京', '北京'], '1813': ['北京', '北京'],
  '1814': ['北京', '北京'], '1815': ['北京', '北京'], '1816': ['北京', '北京'], '1817': ['北京', '北京'],
  '1818': ['北京', '北京'], '1819': ['北京', '北京'],
  '1820': ['北京', '北京'], '1821': ['北京', '北京'], '1822': ['北京', '北京'], '1823': ['北京', '北京'],
  '1824': ['北京', '北京'], '1825': ['北京', '北京'], '1826': ['北京', '北京'], '1827': ['北京', '北京'],
  '1828': ['北京', '北京'], '1829': ['北京', '北京'],
  '1830': ['北京', '北京'], '1831': ['北京', '北京'], '1832': ['北京', '北京'], '1833': ['北京', '北京'],
  '1834': ['北京', '北京'], '1835': ['北京', '北京'], '1836': ['北京', '北京'], '1837': ['北京', '北京'],
  '1838': ['北京', '北京'], '1839': ['北京', '北京'],
  '1840': ['北京', '北京'], '1841': ['北京', '北京'], '1842': ['北京', '北京'], '1843': ['北京', '北京'],
  '1844': ['北京', '北京'], '1845': ['北京', '北京'], '1846': ['北京', '北京'], '1847': ['北京', '北京'],
  '1848': ['北京', '北京'], '1849': ['北京', '北京'],
  '1850': ['北京', '北京'], '1851': ['北京', '北京'], '1852': ['北京', '北京'], '1853': ['北京', '北京'],
  '1854': ['北京', '北京'], '1855': ['北京', '北京'], '1856': ['北京', '北京'], '1857': ['北京', '北京'],
  '1858': ['北京', '北京'], '1859': ['北京', '北京'],
  '1860': ['北京', '北京'], '1861': ['北京', '北京'], '1862': ['北京', '北京'], '1863': ['北京', '北京'],
  '1864': ['北京', '北京'], '1865': ['北京', '北京'], '1866': ['北京', '北京'], '1867': ['北京', '北京'],
  '1868': ['北京', '北京'], '1869': ['北京', '北京'],
  '1870': ['北京', '北京'], '1871': ['北京', '北京'], '1872': ['北京', '北京'], '1873': ['北京', '北京'],
  '1874': ['北京', '北京'], '1875': ['北京', '北京'], '1876': ['北京', '北京'], '1877': ['北京', '北京'],
  '1878': ['北京', '北京'], '1879': ['北京', '北京'],
  '1880': ['北京', '北京'], '1881': ['北京', '北京'], '1882': ['北京', '北京'], '1883': ['北京', '北京'],
  '1884': ['北京', '北京'], '1885': ['北京', '北京'], '1886': ['北京', '北京'], '1887': ['北京', '北京'],
  '1888': ['北京', '北京'], '1889': ['北京', '北京'],
  '1890': ['北京', '北京'], '1891': ['北京', '北京'], '1892': ['北京', '北京'], '1893': ['北京', '北京'],
  '1894': ['北京', '北京'], '1895': ['北京', '北京'], '1896': ['北京', '北京'], '1897': ['北京', '北京'],
  '1898': ['北京', '北京'], '1899': ['北京', '北京'],
  '1980': ['北京', '北京'], '1981': ['北京', '北京'], '1982': ['北京', '北京'], '1983': ['北京', '北京'],
  '1984': ['北京', '北京'], '1985': ['北京', '北京'], '1986': ['北京', '北京'], '1987': ['北京', '北京'],
  '1988': ['北京', '北京'], '1989': ['北京', '北京'],
  '1990': ['北京', '北京'], '1991': ['北京', '北京'], '1992': ['北京', '北京'], '1993': ['北京', '北京'],
  '1994': ['北京', '北京'], '1995': ['北京', '北京'], '1996': ['北京', '北京'], '1997': ['北京', '北京'],
  '1998': ['北京', '北京'], '1999': ['北京', '北京'],
};

export function getLocation(number) {
  const key = String(number).slice(0, 4);
  return NUMBER_LOCATIONS[key] || ['北京', '北京'];
}

// 运营商品牌（按号段前 3 位）
const OPERATOR_BRANDS = {
  '170': '朗玛信息', '171': '朗玛信息', '162': '远特通信', '165': '远特通信', '167': '远特通信',
  '134': '中国移动', '135': '中国移动', '136': '中国移动', '137': '中国移动', '138': '中国移动', '139': '中国移动',
  '147': '中国移动', '150': '中国移动', '151': '中国移动', '152': '中国移动', '157': '中国移动', '158': '中国移动', '159': '中国移动',
  '172': '中国移动', '178': '中国移动', '182': '中国移动', '183': '中国移动', '184': '中国移动', '187': '中国移动', '188': '中国移动', '198': '中国移动',
  '130': '中国联通', '131': '中国联通', '132': '中国联通', '145': '中国联通', '155': '中国联通', '156': '中国联通', '166': '中国联通',
  '175': '中国联通', '176': '中国联通', '185': '中国联通', '186': '中国联通', '196': '中国联通',
  '133': '中国电信', '149': '中国电信', '153': '中国电信', '173': '中国电信', '174': '中国电信', '177': '中国电信',
  '180': '中国电信', '181': '中国电信', '189': '中国电信', '199': '中国电信',
};

export function getBrand(number) {
  const seg3 = String(number).slice(0, 3);
  return OPERATOR_BRANDS[seg3] || '中国移动';
}

export function getHotline(operator) {
  if (operator === '移动') return '10086';
  if (operator === '联通') return '10010';
  if (operator === '电信') return '10000';
  if (operator === '虚拟运营商') return '10030';
  return '10086';
}

const SEED = [
  { number: '17088880999', price: 8800, originalPrice: 12000, packageDetail: '低消69，可选套餐59元赠送来电显示，包含60分钟，15G流量，超出后语音0.15元/分钟，流量1元500M自动叠加（当日有效），30G后0.29元/M，短信0.1元/条', source: '自有' },
  { number: '13166668888', price: 12800, originalPrice: 15800, packageDetail: '低消99，含100分钟通话+30G流量+短信免费，超出按套餐外资费', source: '自有' },
  { number: '18612345678', price: 3600, originalPrice: 5800, packageDetail: '低消39，含50分钟通话+5G流量，超出按套餐外资费', source: '公共' },
  { number: '18900001111', price: 5200, originalPrice: 8800, packageDetail: '低消59，含100分钟+10G流量+来电显示', source: '自有' },
  { number: '13322223333', price: 6800, originalPrice: 10000, packageDetail: '低消69，含60分钟+15G流量+免费短信', source: '自有' },
  { number: '19876543210', price: 9800, originalPrice: 13800, packageDetail: '低消99，含200分钟+30G流量+免费短信', source: '公共' },
  { number: '17788889999', price: 15800, originalPrice: 22000, packageDetail: '低消199，含500分钟+50G流量+免费短信+视频会员', source: '自有' },
  { number: '16512344321', price: 1200, originalPrice: 2000, packageDetail: '低消29，含30分钟+3G流量', source: '公共' },
  { number: '15011112222', price: 4200, originalPrice: 6800, packageDetail: '低消49，含60分钟+8G流量', source: '自有' },
  { number: '18199998888', price: 13800, originalPrice: 18800, packageDetail: '低消129，含300分钟+30G流量+免费短信', source: '自有' },
  { number: '13800001357', price: 2600, originalPrice: 0, packageDetail: '低消29，含30分钟+3G流量', source: '公共' },
  { number: '16755556666', price: 7600, originalPrice: 10800, packageDetail: '低消69，含60分钟+15G流量', source: '自有' },
  { number: '19912349876', price: 3200, originalPrice: 5200, packageDetail: '低消39，含50分钟+5G流量', source: '公共' },
  { number: '15566667777', price: 11200, originalPrice: 16000, packageDetail: '低消99，含200分钟+30G流量', source: '自有' },
  { number: '13288887777', price: 12600, originalPrice: 17800, packageDetail: '低消119，含300分钟+30G流量+免费短信', source: '自有' },
  { number: '18011112233', price: 3900, originalPrice: 5800, packageDetail: '低消49，含60分钟+8G流量', source: '公共' },
  { number: '17122225555', price: 8800, originalPrice: 12800, packageDetail: '低消79，含100分钟+20G流量', source: '自有' },
  { number: '15933334444', price: 6400, originalPrice: 9800, packageDetail: '低消59，含80分钟+10G流量', source: '自有' },
  { number: '16244445555', price: 5400, originalPrice: 8000, packageDetail: '低消49，含60分钟+8G流量', source: '公共' },
  { number: '13456789876', price: 2900, originalPrice: 4800, packageDetail: '低消29，含30分钟+3G流量', source: '公共' },
];

export async function seedIfEmpty(env) {
  const items = await readAll(env);
  if (items.length > 0) return items;
  const existing = new Set(items.map((it) => it.number));
  const newEntries = [];
  for (const s of SEED) {
    const number = normalizeNumber(s.number);
    if (!number || existing.has(number)) continue;
    const cls = classifyNumber(number);
    const op = detectOperator(number);
    const [prov, city] = getLocation(number);
    newEntries.push({
      id: genId(),
      number,
      operator: s.operator || op,
      brand: s.brand || getBrand(number),
      province: s.province || prov,
      city: s.city || city,
      hotline: s.hotline || getHotline(s.operator || op),
      level: s.level || cls.level,
      tag: s.tag || cls.tag || '普通号',
      price: s.price || 0,
      originalPrice: s.originalPrice || 0,
      packageDetail: s.packageDetail || '',
      installment: s.installment || 0,
      source: s.source || '自有',
      recommendLevel: s.recommendLevel || '',
      isHot: s.isHot || false,
      isRecommend: s.isRecommend || false,
      isSpecial: s.isSpecial || false,
      onShelf: s.onShelf !== false,
      isSold: s.isSold || false,
      status: 'available',
      createdAt: new Date().toISOString(),
    });
    existing.add(number);
  }
  if (newEntries.length) {
    items.push(...newEntries);
    await writeAll(env, items);
  }
  return items;
}

// ---- 业务方法（与 server.js 对齐）----
export const service = {
  async list(env, {
    q, operator, level, status, tag,
    minPrice, maxPrice, notIn, brand, province, city, source, recommendLevel,
    onShelf, isSold, isHot, isRecommend, isSpecial,
    page = 1, pageSize = 24, sort = 'new',
  }) {
    let items = await readAll(env);
    if (q) {
      const pattern = q.replace(/\*/g, '.*');
      const re = new RegExp(pattern);
      items = items.filter((it) => re.test(it.number));
    }
    if (operator && operator !== 'all') items = items.filter((it) => it.operator === operator);
    if (level && level !== 'all') items = items.filter((it) => it.level === level);
    if (tag && tag !== 'all') items = items.filter((it) => it.tag === tag || it.level === tag);
    if (status && status !== 'all') items = items.filter((it) => (it.status || 'available') === status);
    if (brand && brand !== 'all') items = items.filter((it) => it.brand === brand);
    if (province && province !== 'all') items = items.filter((it) => it.province === province);
    if (city && city !== 'all') items = items.filter((it) => it.city === city);
    if (source && source !== 'all') items = items.filter((it) => (it.source || '自有') === source);
    if (recommendLevel && recommendLevel !== 'all') items = items.filter((it) => it.recommendLevel === recommendLevel);
    if (onShelf && onShelf !== 'all') items = items.filter((it) => Boolean(it.onShelf) === (onShelf === 'on'));
    if (isSold && isSold !== 'all') items = items.filter((it) => Boolean(it.isSold) === (isSold === 'sold'));
    if (isHot && isHot !== 'all') items = items.filter((it) => Boolean(it.isHot) === (isHot === 'hot'));
    if (isRecommend && isRecommend !== 'all') items = items.filter((it) => Boolean(it.isRecommend) === (isRecommend === 'rec'));
    if (isSpecial && isSpecial !== 'all') items = items.filter((it) => Boolean(it.isSpecial) === (isSpecial === 'spe'));
    if (minPrice != null && minPrice !== '' && !isNaN(Number(minPrice))) items = items.filter((it) => (it.price || 0) >= Number(minPrice));
    if (maxPrice != null && maxPrice !== '' && !isNaN(Number(maxPrice))) items = items.filter((it) => (it.price || 0) <= Number(maxPrice));
    if (notIn) {
      const banned = String(notIn).split(',').map((s) => s.trim()).filter(Boolean);
      if (banned.length) items = items.filter((it) => !banned.some((d) => it.number.includes(d)));
    }

    if (sort === 'price_desc') items = items.slice().sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sort === 'price_asc') items = items.slice().sort((a, b) => (a.price || 0) - (b.price || 0));
    else items = items.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const total = items.length;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.max(1, parseInt(pageSize, 10) || 24);
    const start = (p - 1) * ps;
    const data = items.slice(start, start + ps);
    return { data, total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps) };
  },

  async findById(env, id) {
    const items = await readAll(env);
    return items.find((it) => it.id === id) || null;
  },

  async stats(env) {
    const items = await readAll(env);
    const byOperator = {};
    let available = 0;
    let premium = 0;
    let hot = 0;
    let sold = 0;
    for (const it of items) {
      byOperator[it.operator] = (byOperator[it.operator] || 0) + 1;
      if ((it.status || 'available') === 'available') available++;
      if (it.level === '靓号') premium++;
      if (it.isHot) hot++;
      if (it.isSold) sold++;
    }
    return { total: items.length, available, premium, hot, sold, byOperator };
  },

  async addNumber(env, input) {
    const number = normalizeNumber(input.number);
    if (!number) throw { status: 422, code: 'INVALID_NUMBER', message: '手机号格式不正确（应为11位、1开头的中国大陆手机号）' };
    const items = await readAll(env);
    if (items.some((it) => it.number === number)) {
      throw { status: 409, code: 'DUPLICATE', message: `号码 ${number} 已存在` };
    }
    const cls = classifyNumber(number);
    const op = input.operator && input.operator !== 'auto' ? input.operator : detectOperator(number);
    const [prov, city] = getLocation(number);
    const entry = {
      id: genId(),
      number,
      operator: op,
      brand: input.brand || getBrand(number),
      province: input.province || prov,
      city: input.city || city,
      hotline: input.hotline || getHotline(op),
      level: input.level || cls.level,
      tag: input.tag || cls.tag || '普通号',
      price: Number(input.price) || 0,
      originalPrice: Number(input.originalPrice) || 0,
      packageDetail: input.packageDetail || '',
      installment: Number(input.installment) || 0,
      source: input.source || '自有',
      recommendLevel: input.recommendLevel || '',
      isHot: Boolean(input.isHot),
      isRecommend: Boolean(input.isRecommend),
      isSpecial: Boolean(input.isSpecial),
      onShelf: input.onShelf !== false,
      isSold: Boolean(input.isSold),
      status: input.status || 'available',
      createdAt: new Date().toISOString(),
    };
    items.push(entry);
    await writeAll(env, items);
    return entry;
  },

  async updateNumber(env, id, patch) {
    const items = await readAll(env);
    const idx = items.findIndex((it) => it.id === id);
    if (idx === -1) throw { status: 404, code: 'NOT_FOUND', message: '号码不存在' };
    const cur = items[idx];
    const next = { ...cur };
    for (const k of ['operator', 'brand', 'province', 'city', 'hotline', 'level', 'tag', 'packageDetail', 'source', 'recommendLevel', 'status']) {
      if (patch[k] != null) next[k] = patch[k];
    }
    for (const k of ['price', 'originalPrice', 'installment']) {
      if (patch[k] != null && !isNaN(Number(patch[k]))) next[k] = Number(patch[k]);
    }
    for (const k of ['isHot', 'isRecommend', 'isSpecial', 'isSold']) {
      if (patch[k] != null) next[k] = Boolean(patch[k]);
    }
    if (patch.onShelf != null) next.onShelf = Boolean(patch.onShelf);
    // 自动维护 brand/hotline 与 operator 同步
    if (patch.operator) {
      next.brand = patch.brand || getBrand(cur.number);
      next.hotline = getHotline(patch.operator);
    }
    // 同步 status
    if (next.onShelf === false) next.status = 'offline';
    else if (next.isSold) next.status = 'sold';
    else next.status = 'available';
    items[idx] = next;
    await writeAll(env, items);
    return next;
  },

  async bulkAdd(env, content) {
    if (typeof content !== 'string' || !content.trim()) {
      throw { status: 422, code: 'EMPTY', message: '上传内容为空' };
    }
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items = await readAll(env);
    const existing = new Set(items.map((it) => it.number));
    const results = { inserted: 0, skipped: 0, errors: [] };
    const newEntries = [];

    for (const line of lines) {
      const delim = line.includes('\t') ? '\t' : line.includes('，') ? '，' : line.includes(',') ? ',' : line.includes(';') ? ';' : null;
      const fields = delim ? line.split(delim).map((s) => s.trim()) : [line];
      const number = normalizeNumber(fields[0]);
      if (!number) { results.errors.push({ line, reason: '无法识别为手机号' }); continue; }
      if (existing.has(number)) { results.skipped++; continue; }
      const cls = classifyNumber(number);
      const op = fields[1] && ['移动', '联通', '电信', '虚拟运营商'].includes(fields[1]) ? fields[1] : detectOperator(number);
      const [prov, city] = getLocation(number);
      const entry = {
        id: genId(),
        number,
        operator: op,
        brand: fields[2] || getBrand(number),
        province: fields[3] || prov,
        city: fields[4] || city,
        hotline: getHotline(op),
        level: fields[5] || cls.level,
        tag: fields[6] || cls.tag || '普通号',
        price: Number(fields[7]) || 0,
        originalPrice: Number(fields[8]) || 0,
        packageDetail: fields[9] || '',
        installment: Number(fields[10]) || 0,
        source: fields[11] || '自有',
        recommendLevel: fields[12] || '',
        isHot: fields[13] === '1' || fields[13] === 'true',
        isRecommend: fields[14] === '1' || fields[14] === 'true',
        isSpecial: fields[15] === '1' || fields[15] === 'true',
        onShelf: true,
        isSold: false,
        status: 'available',
        createdAt: new Date().toISOString(),
      };
      existing.add(number);
      newEntries.push(entry);
      results.inserted++;
    }
    if (newEntries.length) {
      items.push(...newEntries);
      await writeAll(env, items);
    }
    return results;
  },

  async deleteNumber(env, id) {
    const items = await readAll(env);
    const idx = items.findIndex((it) => it.id === id);
    if (idx === -1) throw { status: 404, code: 'NOT_FOUND', message: '号码不存在' };
    const [removed] = items.splice(idx, 1);
    await writeAll(env, items);
    return removed;
  },

  async bulkPatch(env, ids, patch) {
    if (!Array.isArray(ids) || !ids.length) return { updated: 0 };
    const idSet = new Set(ids);
    const items = await readAll(env);
    let updated = 0;
    for (let i = 0; i < items.length; i++) {
      if (!idSet.has(items[i].id)) continue;
      for (const k of ['onShelf', 'isHot', 'isRecommend', 'isSpecial', 'isSold', 'recommendLevel', 'source']) {
        if (patch[k] != null) items[i][k] = patch[k];
      }
      if (patch.onShelf === true) items[i].status = 'available';
      if (patch.isSold === true) items[i].status = 'sold';
      updated++;
    }
    if (updated) await writeAll(env, items);
    return { updated };
  },

  async clearPool(env, source) {
    const items = await readAll(env);
    const before = items.length;
    const kept = items.filter((it) => (it.source || '自有') !== source);
    const removed = before - kept.length;
    if (removed > 0) await writeAll(env, kept);
    return { removed };
  },
};
