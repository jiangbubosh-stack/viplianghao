import { json } from '../_lib.js';

export async function onRequestGet() {
  return json({ status: 'ok', time: new Date().toISOString() });
}
