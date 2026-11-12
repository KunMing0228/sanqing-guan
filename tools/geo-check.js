'use strict';

/** 离线 IP 库自测：确认 xdb 解析正确，且内网地址不被误报成某个城市。 */
const geo = require('../server/geoip');

const samples = [
  '8.8.8.8', '1.1.1.1', '114.114.114.114', '223.5.5.5',
  '119.29.29.29', '202.96.128.86', '1.2.4.8', '47.94.1.1',
  '127.0.0.1', '192.168.1.10'
];

console.log('--- xdb 状态 ---');
console.log(JSON.stringify(geo.status(), null, 2));
console.log('\n--- 抽样查询 ---');
let ok = 0;
for (const ip of samples) {
  const region = geo.search(ip);
  const parsed = region ? geo.parseRegion(region) : null;
  if (parsed && parsed.available) ok++;
  console.log(
    ip.padEnd(16),
    parsed ? parsed.text.padEnd(30) : '(库中无匹配)'.padEnd(30),
    region || ''
  );
}

console.log('\n--- 模拟 upgrade 请求（本机 / 公网 / 伪造 XFF）---');
function fake(remote, headers) {
  return { socket: { remoteAddress: remote }, headers: headers || {} };
}
for (const [label, req] of [
  ['本机直连', fake('127.0.0.1')],
  ['局域网', fake('192.168.1.20')],
  ['公网 IP', fake('223.5.5.5')],
  ['不可信来源伪造 XFF', fake('223.5.5.5', { 'x-forwarded-for': '8.8.8.8', 'x-geo-country': '日本' })]
]) {
  const r = geo.resolve(req);
  console.log(label.padEnd(22), '=>', r.geo.text, '| source:', r.geo.source, '| trusted:', r.trusted);
}

console.log(`\n命中 ${ok}/${samples.length} 个抽样 IP。若全部为「库中无匹配」，说明 xdb 解析有误或数据文件缺失。`);
