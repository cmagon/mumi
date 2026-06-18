const XLSX = require('xlsx')
const wb = XLSX.readFile('../Costeo_formalizados Mercadeo_MUMI.xlsm')
const t = process.argv[2], r0 = +(process.argv[3]||1), r1 = +(process.argv[4]||40), c1 = +(process.argv[5]||10)
const ws = wb.Sheets[t]; if (!ws) { console.log('no sheet'); process.exit(0) }
for (let R=r0-1; R<=r1-1; R++) for (let C=0; C<c1; C++) {
  const a = XLSX.utils.encode_cell({r:R,c:C}), cell = ws[a]
  if (!cell) continue
  if (cell.f) console.log(a+' = '+cell.f+(cell.v!=null?'  ->'+String(cell.v).slice(0,12):''))
  else if (cell.v!=='' && cell.v!=null) console.log(a+' : '+String(cell.v).slice(0,24))
}
