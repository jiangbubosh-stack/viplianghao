'use strict';

const $ = (s) => document.querySelector(s);

function getId() {
  const url = new URL(location.href);
  return url.searchParams.get('id') || '';
}

function fmtPrice(n) {
  if (!n && n !== 0) return '--';
  return Number(n).toLocaleString('en-US');
}

async function loadDetail() {
  const id = getId();
  if (!id) {
    $('#loadingState').style.display = 'none';
    $('#errorState').textContent = '缺少号码 ID';
    $('#errorState').style.display = 'block';
    return;
  }
  try {
    const res = await fetch('/api/numbers/' + encodeURIComponent(id));
    if (!res.ok) {
      $('#loadingState').style.display = 'none';
      $('#errorState').style.display = 'block';
      return;
    }
    const body = await res.json();
    renderDetail(body.data, body.recommend || []);
    // 顺带取客服联系方式
    try {
      const s = await (await fetch('/api/settings')).json();
      if (s.contactPhone) {
        $('#kefuPhone').textContent = s.contactPhone;
        $('#kefuPhone').href = 'tel:' + s.contactPhone;
        $('#kefuCall').href = 'tel:' + s.contactPhone;
      }
    } catch { /* ignore */ }
  } catch (e) {
    $('#loadingState').style.display = 'none';
    $('#errorState').textContent = '网络错误，请稍后重试';
    $('#errorState').style.display = 'block';
  }
}

function renderDetail(n, recommend) {
  document.title = (n.number || '靓号') + ' · 上海成霞通讯选号系统';
  $('#dNumber').textContent = n.number || '--';
  $('#dNumber').classList.add('num-pulse');
  $('#dBrand').textContent = n.brand || '--';
  $('#dPrice').textContent = fmtPrice(n.price);
  // 划线价：有原价 + 原价>现价才显示
  if (n.originalPrice && Number(n.originalPrice) > Number(n.price || 0)) {
    $('#dOrig').textContent = '¥' + fmtPrice(n.originalPrice) + '.00';
    $('#dOrigWrap').style.display = '';
  } else {
    $('#dOrigWrap').style.display = 'none';
  }
  $('#dOperator').textContent = n.operator || '--';
  $('#dLoc').textContent = (n.province || '') + ' ' + (n.city || '');
  $('#dHot').textContent = n.hotline || '--';
  $('#dRule').textContent = n.tag || '--';
  $('#dPkg').textContent = n.packageDetail || '请咨询客服了解套餐详情';

  // 客服联系方式（fallback 到号码运营商热线）
  const phone = (n.contactPhone) || n.hotline || '';
  if (phone) {
    $('#kefuPhone').textContent = phone;
    $('#kefuPhone').href = 'tel:' + phone;
    $('#kefuCall').href = 'tel:' + phone;
  }

  // 立即购买：调用客服电话
  $('#buyBtn').addEventListener('click', () => {
    const call = $('#kefuCall').href;
    if (call && call !== 'tel:') location.href = call;
    else alert('请先联系客服');
  });

  // 推荐号码
  if (recommend.length) {
    $('#recommendGrid').innerHTML = recommend.map((it) => `
      <a class="rec-card" href="/detail?id=${encodeURIComponent(it.id)}">
        <div class="rec-num">${it.number}</div>
        <div class="rec-meta">${it.operator || ''} · ${it.city || ''} · ${it.brand || ''}</div>
        <div class="rec-bottom">
          ${it.recommendLevel ? `<span class="rec-tag rec-tag-${it.recommendLevel}">${it.recommendLevel}</span>` : ''}
          <span class="rec-price">¥${fmtPrice(it.price)}</span>
        </div>
      </a>
    `).join('');
    $('#recommendSection').style.display = '';
  }

  $('#loadingState').style.display = 'none';
  $('#detailMain').style.display = '';
}

loadDetail();
