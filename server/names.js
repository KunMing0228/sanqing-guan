'use strict';

const crypto = require('node:crypto');

// 道号：前缀取道家意象，后缀取身份，组合成「松风散人」这类中式诗意称呼。
const PREFIX = [
  '清虚', '云水', '抱朴', '守静', '玄微', '澹然', '松风', '明月', '竹影', '听雨',
  '无咎', '知白', '冲和', '澄心', '忘机', '谷神', '希夷', '素朴', '虚舟', '观澜',
  '拾云', '鹤鸣', '寒潭', '止水', '朝彻', '灵台', '天真', '玄同', '静笃', '若谷',
  '霜华', '空山', '闲云', '抱一', '归根', '袭明', '希声', '微明', '渊兮', '湛然'
];
const SUFFIX_M = ['道人', '童子', '道童', '散人', '居士', '行者', '山人', '羽客', '闲人', '野鹤'];
const SUFFIX_F = ['道姑', '女冠', '仙姑', '散人', '居士', '清客', '云客', '羽客', '闲人', '侍香'];
const SUFFIX = [...new Set([...SUFFIX_M, ...SUFFIX_F])];
const ROBES_M = ['玄青', '月白', '赭黄', '苍绿', '墨蓝', '檀褐'];
const ROBES_F = ['藕荷', '月白', '霜色', '苍绿', '杏黄', '黛紫'];
const ROBES = [...new Set([...ROBES_M, ...ROBES_F])];

function pick(arr) { return arr[crypto.randomInt(arr.length)]; }

function makeName(used, gender = 'm') {
  // 尽量避开同殿重名；最多试 8 次，之后加序号保证唯一
  const pool = gender === 'f' ? SUFFIX_F : SUFFIX_M;
  for (let k = 0; k < 8; k++) {
    const n = pick(PREFIX) + pick(pool);
    if (!used || !used.has(n)) return n;
  }
  return pick(PREFIX) + pick(pool) + String(crypto.randomInt(2, 99));
}

function makeRobe(gender = 'm') { return pick(gender === 'f' ? ROBES_F : ROBES_M); }
function makeId() { return crypto.randomBytes(6).toString('hex'); }

module.exports = { makeName, makeRobe, makeId, ROBES, ROBES_M, ROBES_F };
