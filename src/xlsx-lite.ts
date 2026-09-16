// Minimal .xlsx writer for Cloudflare Workers (no Node APIs). Supports text,
// numbers, formulas, a handful of named styles, column widths, merged cells
// and frozen header rows. Formulas carry no cached value; the workbook is
// flagged fullCalcOnLoad so Excel / LibreOffice / Google Sheets recalculate
// on open. Used for the B&W Payroll Excel (2026-09-15).
import { zipSync, strToU8 } from 'fflate'

export type CellStyle = 'text' | 'bold' | 'header' | 'title' | 'money' | 'moneyBold' | 'edit' | 'editMoney' | 'wrap' | 'num' | 'numBold' | 'note' | 'sub' | 'subMoney' | 'flag' | 'flagLine' | 'editNum' | 'band0' | 'band0Num' | 'band0Money' | 'band1' | 'band1Num' | 'band1Money' | 'band2' | 'band2Num' | 'band2Money' | 'band3' | 'band3Num' | 'band3Money' | 'band4' | 'band4Num' | 'band4Money' | 'band5' | 'band5Num' | 'band5Money'
export type Cell = { v?: string | number | null, f?: string, s?: CellStyle } | string | number | null | undefined
export type Sheet = { name: string, rows: Cell[][], widths?: number[], merges?: string[], freeze?: number, heights?: Record<number, number> }

const STYLE_INDEX: Record<CellStyle, number> = { text: 0, bold: 1, header: 2, title: 3, money: 4, moneyBold: 5, edit: 6, editMoney: 7, wrap: 8, num: 9, numBold: 10, note: 11, sub: 12, subMoney: 13, flag: 14, flagLine: 15, editNum: 16, band0: 17, band0Num: 18, band0Money: 19, band1: 20, band1Num: 21, band1Money: 22, band2: 23, band2Num: 24, band2Money: 25, band3: 26, band3Num: 27, band3Money: 28, band4: 29, band4Num: 30, band4Money: 31, band5: 32, band5Num: 33, band5Money: 34 }

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
export function colLetter(n: number) { let s = ''; let x = n; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26) } return s }
export function ref(col: number, row: number) { return colLetter(col) + row }
export function sheetRef(name: string) { return "'" + name.replace(/'/g, "''") + "'" }

function cellXml(c: Cell, col: number, row: number) {
  if (c === null || c === undefined) return ''
  const r = ref(col, row)
  const obj = (typeof c === 'object') ? c : { v: c }
  const s = STYLE_INDEX[obj.s || (typeof obj.v === 'number' ? 'num' : 'text')] || 0
  if (obj.f) return `<c r="${r}" s="${s}"><f>${esc(obj.f)}</f></c>`
  if (obj.v === null || obj.v === undefined || obj.v === '') return s ? `<c r="${r}" s="${s}"/>` : ''
  if (typeof obj.v === 'number') return `<c r="${r}" s="${s}"><v>${Number.isFinite(obj.v) ? obj.v : 0}</v></c>`
  const text = String(obj.v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  return `<c r="${r}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`
}

function sheetXml(sh: Sheet) {
  const cols = (sh.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  const rows = sh.rows.map((row, ri) => {
    const cells = row.map((c, ci) => cellXml(c, ci + 1, ri + 1)).join('')
    const h = sh.heights && sh.heights[ri + 1]
    const attrs = h ? ` ht="${h}" customHeight="1"` : ''
    return (cells || h) ? `<row r="${ri + 1}"${attrs}>${cells}</row>` : ''
  }).join('')
  const merges = sh.merges && sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''
  const freeze = sh.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData>${merges}</worksheet>`
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R&quot;#,##0.00"/></numFmts>
<fonts count="4"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font><font><i/><sz val="9"/><color rgb="FF555555"/><name val="Calibri"/></font></fonts>
<fills count="12"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2A8"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF3FF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFDE2E2"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF3FF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF8EC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF6E5"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6EAFB"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFEEF0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDF7F9"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBBBBBB"/></left><right style="thin"><color rgb="FFBBBBBB"/></right><top style="thin"><color rgb="FFBBBBBB"/></top><bottom style="thin"><color rgb="FFBBBBBB"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="35">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="2" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="2" fontId="1" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="1" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="1" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="2" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="6" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="2" fontId="0" fillId="6" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="6" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="7" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="2" fontId="0" fillId="7" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="7" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="8" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="2" fontId="0" fillId="8" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="8" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="9" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="2" fontId="0" fillId="9" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="9" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="10" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="2" fontId="0" fillId="10" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="10" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="11" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="2" fontId="0" fillId="11" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="11" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  files['[Content_Types].xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)
  files['_rels/.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)
  files['xl/workbook.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`)
  files['xl/_rels/workbook.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)
  files['xl/styles.xml'] = strToU8(STYLES_XML)
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)) })
  return zipSync(files, { level: 6 })
}
