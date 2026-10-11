// 一次性 i18n key 对齐检查:提取 src 里所有 t`` 的 key(占位符按位置编号),与 i18n/en.json 比对
const fs = require('fs');
const path = require('path');

const keys = new Set();
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|vue)$/.test(name)) {
      const src = fs.readFileSync(p, 'utf8');
      // t`...`:捕获反引号之间内容(${} 内无嵌套反引号,可直接匹配);前面不能是标识符字符或点(排除 attrText` 之类误配)
      for (const m of src.matchAll(/(?:^|[^\w.])t`([^`]*)`/g)) {
        let i = 0;
        const key = m[1].replace(/\$\{[^}]*\}/g, () => '${' + i++ + '}');
        keys.add(key);
      }
    }
  }
}
walk(path.join(__dirname, '..', 'src'));

const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'en.json'), 'utf8'));
const enKeys = new Set(Object.keys(en));
const missing = [...keys].filter(k => !enKeys.has(k)).sort();
const unused = [...enKeys].filter(k => !keys.has(k)).sort();
const dup = Object.keys(en).length - enKeys.size;
console.log('used in code:', keys.size, '| en.json:', enKeys.size, '| duplicate keys in json:', dup);
console.log('--- missing (' + missing.length + ') ---');
missing.forEach(k => console.log(JSON.stringify(k)));
console.log('--- unused (' + unused.length + ') ---');
unused.forEach(k => console.log(JSON.stringify(k)));
