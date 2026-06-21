const path = require('path');

const fromDir = '/home/julfi/Desktop/projects/billed-core/worker/src/lib/recovery/';
const toDir = '/home/julfi/Desktop/projects/billed-core/worker/src/lib/billzo/';
const fileName = 'supabase-admin.ts';

const relativePath = path.join(fromDir, '..', 'billzo', fileName);
const relativePath2 = path.join(require('path').relative(fromDir, toDir), fileName);

console.log('Relative path 1:', relativePath);
console.log('Relative path 2:', relativePath2);
