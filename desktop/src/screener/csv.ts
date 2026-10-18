export interface CSVData {headers:string[];rows:(string|number|null)[][]}
/** Formula-safe strings, finite numeric cells, RFC 4180 quoting. No arbitrary file paths. */
export function formatCSV(input:CSVData){
 if(!input||!Array.isArray(input.headers)||!input.headers.length||input.headers.length>40||!Array.isArray(input.rows)||input.rows.length>5000)throw Error('Export supports up to 5000 result rows and 40 columns');
 const cell=(value:unknown)=>{if(value===null)return '""';if(typeof value!=='number'&&typeof value!=='string'||typeof value==='number'&&!Number.isFinite(value)||typeof value==='string'&&value.length>4000)throw Error('Invalid CSV value');let text=String(value);if(typeof value==='string'&&/^[\s]*[=+@\-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 if(input.rows.some(row=>!Array.isArray(row)||row.length!==input.headers.length))throw Error('Invalid CSV row width');
 const text='\uFEFF'+[input.headers,...input.rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';if(text.length>5_000_000)throw Error('CSV exceeds the export size limit');return text;
}
