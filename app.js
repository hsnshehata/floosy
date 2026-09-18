/* فلوسي - منطق التطبيق (يعمل أوفلاين بالكامل) */
const LS_KEY = 'floosy_v1';
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const todayISO = () => new Date().toISOString().slice(0,10);
const monthISO = (d=new Date()) => d.toISOString().slice(0,7);

const DEFAULT_CATS = [
  {id:'food', name:'أكل وشرب', icon:'🍔', type:'expense'},
  {id:'home', name:'سكن وتوضيب', icon:'🏠', type:'expense'},
  {id:'transport', name:'مواصلات', icon:'🚗', type:'expense'},
  {id:'bills', name:'فواتير واشتراكات', icon:'🧾', type:'expense'},
  {id:'health', name:'صحة', icon:'💊', type:'expense'},
  {id:'edu', name:'تعليم', icon:'📚', type:'expense'},
  {id:'shop', name:'تسوق ولبس', icon:'🛍️', type:'expense'},
  {id:'fun', name:'ترفيه وخروجات', icon:'🎮', type:'expense'},
  {id:'family', name:'عيلة ومناسبات', icon:'👨‍👩‍👧', type:'expense'},
  {id:'other-e', name:'متنوع', icon:'📦', type:'expense'},
  {id:'salary', name:'مرتب', icon:'💼', type:'income'},
  {id:'free', name:'شغل حر', icon:'💻', type:'income'},
  {id:'other-i', name:'دخل إضافي', icon:'💰', type:'income'},
];

let DB = load() || seedEmpty();
let txType = 'expense', debtDir = 'owe', selCat = 'home';
let charts = {};
let curMonth = monthISO();
let curProjectDetail = null;

function seedEmpty(){
  return { txs:[], projects:[], budgets:[], reminders:[], debts:[],
    cats: JSON.parse(JSON.stringify(DEFAULT_CATS)),
    settings:{ name:'', currency:'ج.م', monthStart:1, theme:'light' } };
}
function load(){ try{ const r=localStorage.getItem(LS_KEY); return r?JSON.parse(r):null }catch(e){return null} }
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(DB)); }
function fmt(n){ const c=DB.settings.currency||'ج.م'; return Number(n||0).toLocaleString('ar-EG',{maximumFractionDigits:0})+' '+c; }
function fmtDate(iso){ if(!iso) return ''; try{ return new Date(iso+'T12:00:00').toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'}) }catch(e){return iso} }
function daysUntil(iso){ const t=new Date(); t.setHours(0,0,0,0); const d=new Date(iso+'T12:00:00'); return Math.round((d-t)/86400000); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.add('hidden'),2200); }
function esc(s){ return String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function catOf(id){ return DB.cats.find(c=>c.id===id) || {name:id||'—', icon:'📦'}; }
function projOf(id){ return DB.projects.find(p=>p.id===id); }

// ---------- بيانات تجريبية (توضيب الشقة بالقرش) ----------
function sampleData(){
  const m = curMonth;
  const P1 = {id:uid(), name:'توضيب الشقة', icon:'🏠', budget:150000, desc:'دهان، سباكة، كهربا، سيراميك، عفش', created:todayISO()};
  const P2 = {id:uid(), name:'جواز 👰', icon:'💍', budget:80000, desc:'شبكة وفرح', created:todayISO()};
  const txs = [
    {note:'أسمنت 10 شكاير', amount:2200, cat:'home', project:P1.id},
    {note:'أجرة السباك - تأسيس الحمام', amount:3500, cat:'home', project:P1.id},
    {note:'سيراميك المطبخ', amount:12500, cat:'home', project:P1.id},
    {note:'دهانات جوتن 3 بستلات', amount:6800, cat:'home', project:P1.id},
    {note:'أسلاك كهربا + مفاتيح', amount:4300, cat:'home', project:P1.id},
    {note:'نجارة باب الشقة', amount:9000, cat:'home', project:P1.id},
    {note:'مرتب الشهر', amount:25000, cat:'salary', type:'income', note2:''},
    {note:'شغل فريلانس تصميم', amount:6000, cat:'free', type:'income'},
    {note:'سوبر ماركت', amount:1800, cat:'food'},
    {note:'بنزين', amount:1200, cat:'transport'},
    {note:'فاتورة الكهربا', amount:650, cat:'bills'},
    {note:'خروجة على النيل', amount:900, cat:'fun'},
  ].map((t,i)=>({ id:uid()+i, type:t.type||'expense', amount:t.amount, cat:t.cat, project:t.project||null,
    note:t.note, method:['💵 كاش','💳 بطاقة بنكية','📱 محفظة إلكترونية'][i%3], date: m+'-'+String(Math.min(28,3+i*2)).padStart(2,'0') }));
  const rems = [
    {id:uid(), title:'قسط الشقة', amount:8000, date:addDays(2), repeat:'monthly', before:3, cat:'سكن', done:false},
    {id:uid(), title:'فاتورة النت', amount:400, date:addDays(5), repeat:'monthly', before:2, cat:'فواتير', done:false},
    {id:uid(), title:'الجمعية', amount:5000, date:addDays(-1), repeat:'monthly', before:3, cat:'التزامات', done:false},
    {id:uid(), title:'اشتراك الجيم', amount:600, date:addDays(12), repeat:'monthly', before:3, cat:'صحة', done:false},
  ];
  const debts = [
    {id:uid(), dir:'owe', person:'عم محمد السباك', amount:4000, paid:1500, date:addDays(10), note:'باقي حساب التأسيس', done:false},
    {id:uid(), dir:'owed', person:'أحمد صاحبي', amount:3000, paid:0, date:addDays(7), note:'سلفة', done:false},
  ];
  return {txs, projects:[P1,P2], budgets:[{id:uid(),cat:'food',limit:6000},{id:uid(),cat:'home',limit:30000},{id:uid(),cat:'transport',limit:3000},{id:uid(),cat:'fun',limit:2000}], reminders:rems, debts};
}
function addDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function loadSampleData(confirmIt){
  if(confirmIt && DB.txs.length && !confirm('تحميل بيانات تجريبية سيضيف مثال توضيب الشقة. متأكد؟')) return;
  const s = sampleData();
  DB.txs = [...s.txs, ...DB.txs];
  DB.projects = [...s.projects, ...DB.projects];
  DB.budgets = [...s.budgets, ...DB.budgets];
  DB.reminders = [...s.reminders, ...DB.reminders];
  DB.debts = [...s.debts, ...DB.debts];
  save(); renderAll(); toast('🎭 اتحمّلت بيانات تجريبية — شوف توضيب الشقة!');
}

// ---------- تهيئة ----------
document.addEventListener('DOMContentLoaded', ()=>{
  applyTheme();
  buildMonthFilter();
  $('txDate').value = todayISO();
  $('rmDate').value = todayISO();
  $('dbDate').value = todayISO();
  $('setName').value = DB.settings.name||'';
  $('setCurrency').value = DB.settings.currency||'ج.م';
  if(!DB.txs.length && !localStorage.getItem(LS_KEY+'_seen')){ loadSampleData(false); localStorage.setItem(LS_KEY+'_seen','1'); }
  bindTabs(); renderAll();
  setInterval(checkRemindersTick, 60000);
  setTimeout(checkRemindersTick, 3000);
});

function applyTheme(){ document.documentElement.classList.toggle('dark', DB.settings.theme==='dark'); $('themeBtn').textContent = DB.settings.theme==='dark'?'☀️':'🌙'; }
$('themeBtn').onclick = ()=>{ DB.settings.theme = DB.settings.theme==='dark'?'light':'dark'; save(); applyTheme(); renderCharts(); };

function buildMonthFilter(){
  const sel = $('monthFilter'); sel.innerHTML='';
  const now = new Date();
  for(let i=0;i<12;i++){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1); const v=d.toISOString().slice(0,7);
    const o=document.createElement('option'); o.value=v;
    o.textContent=new Date(v+'-02').toLocaleDateString('ar-EG',{month:'long',year:'numeric'}); sel.appendChild(o); }
  sel.value = curMonth;
  sel.onchange = ()=>{ curMonth=sel.value; renderAll(); };
}

// ---------- تبويبات ----------
function bindTabs(){ document.querySelectorAll('.tabBtn').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab)); }
function switchTab(name){
  document.querySelectorAll('.tabBtn').forEach(b=>b.classList.toggle('tab-active', b.dataset.tab===name));
  document.querySelectorAll('.tabPage').forEach(p=>p.classList.add('hidden'));
  $('tab-'+name).classList.remove('hidden');
  document.querySelectorAll('.mnav').forEach(m=>m.style.color = m.dataset.m===name ? '#7c3aed':'');
  if(name==='reports') renderReports();
  window.scrollTo({top:0,behavior:'smooth'});
}

// ---------- مودالات ----------
function openModal(id){ $(id).classList.remove('hidden'); if(id==='txModal') renderTxCats(); if(id==='budgetModal') fillBudgetCats(); }
function closeModal(id){ $(id).classList.add('hidden'); }
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{ if(e.target===m) m.classList.add('hidden'); }));

// ---------- معاملات ----------
function setTxType(t){ txType=t;
  $('typeExpense').className='typeBtn'+(t==='expense'?' type-active-expense':'');
  $('typeIncome').className='typeBtn'+(t==='income'?' type-active-income':'');
  renderTxCats();
}
function renderTxCats(){
  const list = DB.cats.filter(c=>c.type===txType);
  if(!list.find(c=>c.id===selCat)) selCat = list[0]?.id;
  $('txCats').innerHTML = list.map(c=>`<div onclick="selCat='${c.id}';renderTxCats()" class="catPick ${selCat===c.id?'sel':''}"><div class="text-2xl">${c.icon}</div><div>${esc(c.name)}</div></div>`).join('');
  const ps = `<option value="">بدون مشروع</option>`+DB.projects.map(p=>`<option value="${p.id}">${p.icon} ${esc(p.name)}</option>`).join('');
  $('txProject').innerHTML = ps;
}
function saveTx(){
  const amount = parseFloat($('txAmount').value);
  if(!amount || amount<=0) return toast('⚠️ دخل المبلغ الأول');
  DB.txs.unshift({ id:uid(), type:txType, amount, cat:selCat, project:$('txProject').value||null,
    note:$('txNote').value.trim(), method:$('txMethod').value, date:$('txDate').value||todayISO() });
  save(); closeModal('txModal');
  $('txAmount').value=''; $('txNote').value='';
  renderAll(); toast('✅ اتسجلت — كل قرش محسوب!');
}
function delTx(id){ if(!confirm('تحذف المعاملة دي؟'))return; DB.txs=DB.txs.filter(t=>t.id!==id); save(); renderAll(); }

// ---------- مشاريع ----------
function saveProject(){
  const name=$('prName').value.trim(); if(!name) return toast('⚠️ اكتب اسم المشروع');
  const eid=$('prEditId').value;
  const obj={ id:eid||uid(), name, budget:parseFloat($('prBudget').value)||0, icon:$('prIcon').value||'🏗️', desc:$('prDesc').value.trim(), created:todayISO() };
  if(eid){ const i=DB.projects.findIndex(p=>p.id===eid); DB.projects[i]={...DB.projects[i],...obj}; }
  else DB.projects.unshift(obj);
  $('prName').value='';$('prBudget').value='';$('prIcon').value='';$('prDesc').value='';$('prEditId').value='';
  save(); closeModal('projectModal'); renderAll(); toast('🏗️ المشروع اتحفظ!');
}
function editProject(id){ const p=projOf(id); if(!p)return; $('prName').value=p.name; $('prBudget').value=p.budget; $('prIcon').value=p.icon; $('prDesc').value=p.desc||''; $('prEditId').value=id; openModal('projectModal'); }
function delProject(id){ if(!confirm('تحذف المشروع؟ المعاملات المرتبطة هتفضل موجودة بدون مشروع.'))return; DB.projects=DB.projects.filter(p=>p.id!==id); save(); renderAll(); }
function projSpent(pid, month){ return DB.txs.filter(t=>t.type==='expense'&&t.project===pid&&(!month||t.date.startsWith(month))).reduce((s,t)=>s+t.amount,0); }

// ---------- ميزانيات ----------
function fillBudgetCats(){ const used=new Set(DB.budgets.map(b=>b.cat)); $('bdCat').innerHTML=DB.cats.filter(c=>c.type==='expense').map(c=>`<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join(''); }
function saveBudget(){ const cat=$('bdCat').value, limit=parseFloat($('bdLimit').value); if(!limit||limit<=0) return toast('⚠️ دخل الحد الشهري');
  if(DB.budgets.find(b=>b.cat===cat)) return toast('⚠️ الفئة دي ليها ميزانية بالفعل');
  DB.budgets.unshift({id:uid(),cat,limit}); $('bdLimit').value=''; save(); closeModal('budgetModal'); renderAll(); toast('🎯 الميزانية اتحددت!');
}
function delBudget(id){ DB.budgets=DB.budgets.filter(b=>b.id!==id); save(); renderAll(); }

// ---------- تذكيرات ----------
function saveReminder(){
  const title=$('rmTitle').value.trim(), amount=parseFloat($('rmAmount').value), date=$('rmDate').value;
  if(!title||!amount||!date) return toast('⚠️ كمّل البيانات (العنوان والمبلغ والتاريخ)');
  const eid=$('rmEditId').value;
  const obj={id:eid||uid(),title,amount,date,repeat:$('rmRepeat').value,before:parseInt($('rmBefore').value)||0,cat:$('rmCat').value.trim(),done:false};
  if(eid){ const i=DB.reminders.findIndex(r=>r.id===eid); DB.reminders[i]={...DB.reminders[i],...obj}; } else DB.reminders.unshift(obj);
  $('rmTitle').value='';$('rmAmount').value='';$('rmCat').value='';$('rmEditId').value='';
  save(); closeModal('reminderModal'); renderAll(); toast('⏰ هنفكرك في ميعادك!');
}
function editReminder(id){ const r=DB.reminders.find(x=>x.id===id); if(!r)return; $('rmTitle').value=r.title;$('rmAmount').value=r.amount;$('rmDate').value=r.date;$('rmRepeat').value=r.repeat||'once';$('rmBefore').value=r.before??3;$('rmCat').value=r.cat||'';$('rmEditId').value=id; openModal('reminderModal'); }
function delReminder(id){ if(!confirm('تحذف التذكير؟'))return; DB.reminders=DB.reminders.filter(r=>r.id!==id); save(); renderAll(); }
function payReminder(id){
  const r=DB.reminders.find(x=>x.id===id); if(!r)return;
  DB.txs.unshift({id:uid(),type:'expense',amount:r.amount,cat:'bills',project:null,note:'سداد: '+r.title,method:'💵 كاش',date:todayISO()});
  if(r.repeat==='monthly'){ const d=new Date(r.date+'T12:00:00'); d.setMonth(d.getMonth()+1); r.date=d.toISOString().slice(0,10); }
  else if(r.repeat==='weekly'){ const d=new Date(r.date+'T12:00:00'); d.setDate(d.getDate()+7); r.date=d.toISOString().slice(0,10); }
  else if(r.repeat==='yearly'){ const d=new Date(r.date+'T12:00:00'); d.setFullYear(d.getFullYear()+1); r.date=d.toISOString().slice(0,10); }
  else r.done=true;
  save(); renderAll(); toast('✅ اتسدد واتسجل في المصاريف!');
}
function requestNotifPermission(){ if(!('Notification' in window)) return toast('المتصفح لا يدعم الإشعارات'); Notification.requestPermission().then(p=>toast(p==='granted'?'🔔 الإشعارات اشتغلت!':'🔕 اترفضت الإشعارات')); }
function checkRemindersTick(){
  const due = DB.reminders.filter(r=>!r.done && daysUntil(r.date)<=(r.before??3) && daysUntil(r.date)>=-1);
  if(due.length && 'Notification' in window && Notification.permission==='granted'){
    const key='floosy_notif_'+todayISO();
    if(!sessionStorage.getItem(key)){ due.slice(0,2).forEach(r=>{ try{new Notification('⏰ فلوسي بيفكرك', {body:`${r.title}: ${fmt(r.amount)} — ${daysUntil(r.date)<=0?'ميعاده النهاردة/متأخر':'فاضل '+daysUntil(r.date)+' يوم'}`})}catch(e){} }); sessionStorage.setItem(key,'1'); }
  }
}

// ---------- ديون ----------
function setDebtDir(d){ debtDir=d; $('debtOwe').className='typeBtn'+(d==='owe'?' type-active-expense':''); $('debtOwed').className='typeBtn'+(d==='owed'?' type-active-income':''); }
function saveDebt(){
  const person=$('dbPerson').value.trim(), amount=parseFloat($('dbAmount').value);
  if(!person||!amount) return toast('⚠️ كمّل الاسم والمبلغ');
  const eid=$('dbEditId').value;
  const obj={id:eid||uid(),dir:debtDir,person,amount,paid:eid?(DB.debts.find(d=>d.id===eid)?.paid||0):0,date:$('dbDate').value||todayISO(),note:$('dbNote').value.trim(),done:false};
  if(eid){ const i=DB.debts.findIndex(d=>d.id===eid); DB.debts[i]={...DB.debts[i],...obj}; } else DB.debts.unshift(obj);
  $('dbPerson').value='';$('dbAmount').value='';$('dbNote').value='';$('dbEditId').value='';
  save(); closeModal('debtModal'); renderAll(); toast('🤝 اتسجل!');
}
function payDebt(id, full){
  const d=DB.debts.find(x=>x.id===id); if(!d)return;
  const rest=d.amount-d.paid;
  const v=full?rest:parseFloat(prompt('المبلغ المسدد:', rest)||'0');
  if(!v||v<=0)return;
  d.paid=Math.min(d.amount,d.paid+v);
  if(d.paid>=d.amount)d.done=true;
  DB.txs.unshift({id:uid(),type:d.dir==='owe'?'expense':'income',amount:v,cat:d.dir==='owe'?'other-e':'other-i',project:null,note:(d.dir==='owe'?'سداد دين لـ ':'تحصيل دين من ')+d.person,method:'💵 كاش',date:todayISO()});
  save(); renderAll(); toast('✅ اتسجل السداد!');
}
function delDebt(id){ if(!confirm('تحذف الدين؟'))return; DB.debts=DB.debts.filter(d=>d.id!==id); save(); renderAll(); }

// ---------- فئات / إعدادات ----------
function addCategory(){ const n=$('newCatName').value.trim(); if(!n) return toast('⚠️ اكتب اسم الفئة'); DB.cats.push({id:uid(),name:n,icon:$('newCatIcon').value||'🏷️',type:'expense'}); $('newCatName').value='';$('newCatIcon').value=''; save(); renderAll(); }
function delCategory(id){ if(DB.txs.some(t=>t.cat===id)) return toast('⚠️ الفئة مستخدمة في معاملات — احذفها من المعاملات الأول'); DB.cats=DB.cats.filter(c=>c.id!==id); save(); renderAll(); }
function saveSettings(){ DB.settings.name=$('setName').value.trim(); DB.settings.currency=$('setCurrency').value; DB.settings.monthStart=parseInt($('setMonthStart').value)||1; save(); renderAll(); toast('💾 اتحفظت الإعدادات!'); }
function wipeAll(){ if(!confirm('متأكد؟ هتمسح كل البيانات نهائيًا!'))return; DB=seedEmpty(); save(); renderAll(); toast('🗑️ اتمسح كل حاجة'); }

// ---------- تصدير / استيراد / طباعة ----------
function download(name, content, mime){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type:mime})); a.download=name; a.click(); }
function exportJSON(){ download('floosy-backup-'+todayISO()+'.json', JSON.stringify(DB,null,2), 'application/json'); toast('📤 اتصدّر النسخة الاحتياطية!'); }
function exportCSV(){
  const rows=[['التاريخ','النوع','الفئة','المشروع','المبلغ','الملاحظة','طريقة الدفع']];
  DB.txs.forEach(t=>rows.push([t.date, t.type==='expense'?'مصروف':'دخل', catOf(t.cat).name, projOf(t.project)?.name||'', t.amount, (t.note||'').replace(/,/g,'؛'), t.method||'']));
  download('floosy-'+curMonth+'.csv','\ufeff'+rows.map(r=>r.join(',')).join('\n'),'text/csv');
  toast('📥 اتصدّر ملف Excel/CSV!');
}
function importJSON(e){ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{ try{ const d=JSON.parse(r.result); if(!d.txs) throw 0; DB={...seedEmpty(),...d}; save(); renderAll(); toast('📲 اتستوردت البيانات!'); }catch(err){ toast('⚠️ ملف غير صالح'); } }; r.readAsText(f); }
function printReport(){ window.print(); }

// ---------- عرض ----------
function monthTxs(){ return DB.txs.filter(t=>t.date.startsWith(curMonth)); }
function sums(list){ let inc=0,exp=0; list.forEach(t=>t.type==='income'?inc+=+t.amount:exp+=+t.amount); return {inc,exp,net:inc-exp}; }

function renderAll(){
  const list=monthTxs(), {inc,exp,net}=sums(list);
  const upcoming=DB.reminders.filter(r=>!r.done).reduce((s,r)=>s+(r.date.startsWith(curMonth)?+r.amount:0),0);
  $('statIncome').textContent=fmt(inc); $('statExpense').textContent=fmt(exp);
  $('statNet').textContent=fmt(net); $('statNet').parentElement.className='stat-card bg-gradient-to-br '+(net>=0?'from-brand-600 to-indigo-600':'from-red-500 to-rose-600')+' text-white';
  $('statIncomeCount').textContent=list.filter(t=>t.type==='income').length+' معاملة';
  $('statExpenseCount').textContent=list.filter(t=>t.type==='expense').length+' معاملة';
  const safe=net-upcoming;
  $('statSafe').textContent=fmt(safe);
  $('statSafeHint').textContent='بعد خصم مستحقات '+fmt(upcoming);
  $('statSafe').className='text-xl md:text-2xl font-black '+(safe>=0?'text-brand-700 dark:text-brand-300':'text-red-600');

  renderUrgent(); renderRecent(); renderDashProjects(); renderDashBudgets(); renderTxPage(); renderProjects(); renderBudgets(); renderReminders(); renderDebts(); renderSettingsCats(); renderTip(list); renderCharts(); updateBadge();
  // فلاتر
  $('fltCat').innerHTML='<option value="">كل الفئات</option>'+DB.cats.map(c=>`<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('');
  $('fltProject').innerHTML='<option value="">كل المشاريع</option>'+DB.projects.map(p=>`<option value="${p.id}">${p.icon} ${esc(p.name)}</option>`).join('');
}

function updateBadge(){ const n=DB.reminders.filter(r=>!r.done&&daysUntil(r.date)<= (r.before??3)).length; const b=$('reminderBadge'); b.textContent=n; b.classList.toggle('hidden',!n); }

function renderUrgent(){
  const box=$('urgentBox');
  const urg=DB.reminders.filter(r=>!r.done&&daysUntil(r.date)<=7).sort((a,b)=>a.date.localeCompare(b.date));
  if(!urg.length){box.classList.add('hidden');return;}
  box.classList.remove('hidden');
  box.innerHTML=`<div class="font-black mb-2">🚨 عندك ${urg.length} مستحقات قريبة — الإجمالي ${fmt(urg.reduce((s,r)=>s+ +r.amount,0))}</div><div class="flex flex-wrap gap-2">`+
    urg.slice(0,5).map(r=>{const d=daysUntil(r.date);const lbl=d<0?`متأخر ${-d} يوم`:d===0?'النهاردة!':`فاضل ${d} يوم`;
    return `<span class="bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl text-sm font-bold border ${d<=0?'border-red-300 text-red-600':'border-amber-300'}">⏰ ${esc(r.title)} • ${fmt(r.amount)} • ${lbl}</span>`}).join('')+`</div>`;
}

function txRow(t){
  const c=catOf(t.cat), p=projOf(t.project);
  const neg=t.type==='expense';
  return `<div class="tx-row">
    <div class="w-11 h-11 rounded-xl ${neg?'bg-red-50 dark:bg-red-950':'bg-emerald-50 dark:bg-emerald-950'} flex items-center justify-center text-2xl shrink-0">${c.icon}</div>
    <div class="flex-1 min-w-0">
      <div class="font-bold truncate">${esc(t.note)||c.name}</div>
      <div class="text-xs text-slate-500 truncate">${c.name}${p?' • '+p.icon+' '+esc(p.name):''} • ${fmtDate(t.date)}${t.method?' • '+esc(t.method):''}</div>
    </div>
    <div class="font-black ${neg?'text-red-600':'text-emerald-600'} whitespace-nowrap">${neg?'−':'+'}${fmt(t.amount)}</div>
    <button onclick="delTx('${t.id}')" class="text-slate-300 hover:text-red-500 text-lg no-print">×</button>
  </div>`;
}
function renderRecent(){ const r=[...DB.txs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6); $('recentList').innerHTML=r.length?r.map(txRow).join(''):'<p class="text-sm text-slate-400 text-center py-6">لسه مفيش معاملات — دوس "أضف مصروف" وابدأ 💪</p>'; }

function renderDashProjects(){
  const act=DB.projects.slice(0,4);
  $('dashProjects').innerHTML=act.length?act.map(p=>{const s=projSpent(p.id);const pct=p.budget?Math.min(100,s/p.budget*100):0;
    return `<div class="bg-slate-50 dark:bg-slate-800 rounded-2xl p-3 cursor-pointer hover:shadow" onclick="switchTab('projects')">
    <div class="flex items-center gap-2 font-black"><span class="text-2xl">${p.icon}</span>${esc(p.name)}</div>
    <div class="text-xs text-slate-500 mt-1">صرفت ${fmt(s)}${p.budget?' من '+fmt(p.budget):''}</div>
    <div class="prog mt-2"><div style="width:${pct}%;background:${pct>90?'#ef4444':pct>70?'#f59e0b':'linear-gradient(to left,#7c3aed,#d946ef)'}"></div></div></div>`}).join('')
    :'<p class="text-sm text-slate-400">مفيش مشاريع — اعمل مشروع "توضيب الشقة" وتابع كل قرش 🏠</p>';
}

function budgetSpent(cat){ return monthTxs().filter(t=>t.type==='expense'&&t.cat===cat).reduce((s,t)=>s+ +t.amount,0); }
function renderDashBudgets(){
  $('dashBudgets').innerHTML=DB.budgets.slice(0,5).map(b=>{const c=catOf(b.cat),s=budgetSpent(b.cat),pct=Math.min(100,s/b.limit*100);
    return `<div><div class="flex justify-between text-sm font-bold"><span>${c.icon} ${esc(c.name)}</span><span class="${s>b.limit?'text-red-600':''}">${fmt(s)} / ${fmt(b.limit)}</span></div><div class="prog mt-1"><div style="width:${pct}%;background:${s>b.limit?'#ef4444':'linear-gradient(to left,#10b981,#14b8a6)'}"></div></div></div>`}).join('')||'<p class="text-sm text-slate-400">حدد ميزانية لكل فئة من تبويب الميزانيات 🎯</p>';
}

function renderTip(list){
  const {inc,exp}=sums(list);
  let tip='💪 سجّل كل مصروف أول بأول — السر في الاستمرارية مش في المبلغ.';
  if(exp>inc&&inc>0) tip='⚠️ صرفت أكتر من دخلك الشهر ده! راجع فئة الترفيه والتسوق وقلل 20%.';
  else if(exp>0){ const by={}; list.filter(t=>t.type==='expense').forEach(t=>by[t.cat]=(by[t.cat]||0)+ +t.amount);
    const top=Object.entries(by).sort((a,b)=>b[1]-a[1])[0];
    if(top){ const c=catOf(top[0]); tip=`📌 أعلى فئة عندك هي "${c.name}" (${fmt(top[1])}). لو قللتها 15% هتوفر ${fmt(top[1]*0.15)} شهريًا.`; } }
  const r=DB.reminders.filter(x=>!x.done&&daysUntil(x.date)<=3);
  if(r.length) tip=`⏰ خد بالك: "${r[0].title}" ميعاده قرب (${fmt(r[0].amount)}). جهّز فلوسه الأول.`;
  $('smartTip').textContent=tip;
}

// --- صفحة المعاملات ---
document.addEventListener('click',e=>{ const b=e.target.closest?.('.fltType'); if(!b)return;
  document.querySelectorAll('.fltType').forEach(x=>x.className='fltType px-4 py-1.5 rounded-lg'); b.className='fltType px-4 py-1.5 rounded-lg bg-white dark:bg-slate-700 shadow'; b.dataset.sel='1';
  document.querySelectorAll('.fltType').forEach(x=>{if(x!==b)delete x.dataset.sel}); renderTxPage(); });
['fltCat','fltProject','fltSearch','globalSearch'].forEach(id=>document.addEventListener('input',e=>{ if(e.target.id===id) renderTxPage(); }));
function renderTxPage(){
  const typeBtn=document.querySelector('.fltType[data-sel]'); const type=typeBtn?typeBtn.dataset.t:'all';
  const fc=$('fltCat')?.value||'', fp=$('fltProject')?.value||'';
  const q=(($('fltSearch')?.value||'')+' '+($('globalSearch')?.value||'')).trim();
  let list=[...DB.txs].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(type!=='all')list=list.filter(t=>t.type===type);
  if(fc)list=list.filter(t=>t.cat===fc);
  if(fp)list=list.filter(t=>t.project===fp);
  if(q)list=list.filter(t=>(t.note||''+catOf(t.cat).name).includes(q)||catOf(t.cat).name.includes(q));
  const tot=sums(list);
  $('txList').innerHTML=(list.length?`<div class="text-sm text-slate-500 font-bold mb-2">${list.length} معاملة • مصروف ${fmt(tot.exp)} • دخل ${fmt(tot.inc)}</div>`:'')+(list.slice(0,200).map(txRow).join('')||'<p class="text-center text-slate-400 py-10">مفيش نتائج مطابقة 🔍</p>');
}

// --- المشاريع ---
function renderProjects(){
  $('projectsGrid').innerHTML=DB.projects.map(p=>{const sAll=projSpent(p.id), sM=projSpent(p.id,curMonth);const pct=p.budget?Math.min(100,sAll/p.budget*100):0;const left=(p.budget||0)-sAll;
    return `<div class="card hover:shadow-soft transition cursor-pointer" onclick="showProject('${p.id}')">
    <div class="flex items-start justify-between"><div class="text-3xl">${p.icon}</div>
    <div class="flex gap-1 no-print"><button onclick="event.stopPropagation();editProject('${p.id}')" class="btn-ghost !py-1 !px-2">✏️</button><button onclick="event.stopPropagation();delProject('${p.id}')" class="btn-ghost !py-1 !px-2">🗑️</button></div></div>
    <div class="font-black text-lg mt-1">${esc(p.name)}</div>
    <div class="text-xs text-slate-500">${esc(p.desc||'')}</div>
    <div class="flex justify-between text-sm font-bold mt-3"><span>صرفت: <b class="text-red-600">${fmt(sAll)}</b></span>${p.budget?`<span>من ${fmt(p.budget)}</span>`:''}</div>
    ${p.budget?`<div class="prog mt-1"><div style="width:${pct}%;background:${pct>90?'#ef4444':pct>70?'#f59e0b':'linear-gradient(to left,#7c3aed,#d946ef)'}"></div></div><div class="text-xs mt-1 font-bold ${left<0?'text-red-600':'text-emerald-600'}">${left>=0?'فاضل '+fmt(left):'تجاوزت بـ '+fmt(-left)} (${pct.toFixed(0)}%)</div>`:`<div class="text-xs text-slate-400 mt-1">الشهر ده: ${fmt(sM)}</div>`}
    <div class="text-brand-600 text-xs font-black mt-2">اضغط للتفاصيل بالقرش ←</div></div>`}).join('')||'<p class="text-slate-400">اعمل أول مشروع ليك — مثال: توضيب الشقة 🏠</p>';
  if(curProjectDetail) showProject(curProjectDetail, true);
}
function showProject(id, keep){
  curProjectDetail=id; const p=projOf(id); if(!p){$('projectDetail').classList.add('hidden');return;}
  const txs=DB.txs.filter(t=>t.project===id).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const sAll=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+ +t.amount,0);
  const byCat={}; txs.filter(t=>t.type==='expense').forEach(t=>byCat[t.cat]=(byCat[t.cat]||0)+ +t.amount);
  $('projectDetail').classList.remove('hidden');
  $('projectDetail').innerHTML=`<div class="flex items-center justify-between mb-3"><h3 class="font-black text-xl">${p.icon} ${esc(p.name)} — كشف حساب بالقرش</h3><button onclick="curProjectDetail=null;document.getElementById('projectDetail').classList.add('hidden')" class="btn-ghost">إغلاق ×</button></div>
  <div class="grid grid-cols-3 gap-2 mb-3 text-center">
    <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-3"><div class="text-xs text-slate-500">إجمالي المصروف</div><div class="font-black text-red-600">${fmt(sAll)}</div></div>
    <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-3"><div class="text-xs text-slate-500">الميزانية</div><div class="font-black">${p.budget?fmt(p.budget):'—'}</div></div>
    <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-3"><div class="text-xs text-slate-500">عدد البنود</div><div class="font-black">${txs.length}</div></div>
  </div>
  <div class="font-black text-sm mb-2">التوزيع حسب البند:</div>
  <div class="space-y-1.5 mb-4">${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([c,v])=>{const ct=catOf(c);const pct=sAll?v/sAll*100:0;return `<div><div class="flex justify-between text-sm font-bold"><span>${ct.icon} ${esc(ct.name)}</span><span>${fmt(v)} (${pct.toFixed(0)}%)</span></div><div class="prog mt-1"><div style="width:${pct}%;background:linear-gradient(to left,#7c3aed,#d946ef)"></div></div></div>`}).join('')||'<p class="text-xs text-slate-400">لسه مفيش مصاريف على المشروع ده</p>'}</div>
  <div class="font-black text-sm mb-2">كل قرش اتدفع (${txs.length}):</div>
  <div class="space-y-2 max-h-96 overflow-y-auto">${txs.map(txRow).join('')||'<p class="text-xs text-slate-400">—</p>'}</div>`;
  if(!keep) $('projectDetail').scrollIntoView({behavior:'smooth'});
}

// --- الميزانيات ---
function renderBudgets(){
  $('budgetsGrid').innerHTML=DB.budgets.map(b=>{const c=catOf(b.cat),s=budgetSpent(b.cat),pct=Math.min(100,s/b.limit*100),ok=s<=b.limit;
    return `<div class="card"><div class="flex items-center justify-between"><div class="font-black text-lg">${c.icon} ${esc(c.name)}</div><button onclick="delBudget('${b.id}')" class="text-slate-300 hover:text-red-500">×</button></div>
    <div class="flex justify-between text-sm font-bold mt-2"><span class="${ok?'':'text-red-600'}">${fmt(s)} من ${fmt(b.limit)}</span><span>${pct.toFixed(0)}%</span></div>
    <div class="prog mt-2"><div style="width:${pct}%;background:${ok?'linear-gradient(to left,#10b981,#14b8a6)':'#ef4444'}"></div></div>
    <div class="text-xs mt-2 font-bold ${ok?'text-emerald-600':'text-red-600'}">${ok?'✅ لسه في الأمان — فاضل '+fmt(b.limit-s):'🚨 تجاوزت الميزانية بـ '+fmt(s-b.limit)+'!'}</div></div>`}).join('')||'<p class="text-slate-400">مفيش ميزانيات — حدد سقف لكل فئة 🎯</p>';
}

// --- التذكيرات ---
function renderReminders(){
  const act=DB.reminders.filter(r=>!r.done).sort((a,b)=>a.date.localeCompare(b.date));
  const over=act.filter(r=>daysUntil(r.date)<0), soon=act.filter(r=>{const d=daysUntil(r.date);return d>=0&&d<=(r.before??3)}), later=act.filter(r=>daysUntil(r.date)>(r.before??3));
  const tot=act.reduce((s,r)=>s+ +r.amount,0);
  $('remindersSummary').innerHTML=`
    <div class="card !p-3 text-center border-red-200"><div class="text-xs text-slate-500">🔴 متأخر</div><div class="font-black text-red-600">${over.length} • ${fmt(over.reduce((s,r)=>s+ +r.amount,0))}</div></div>
    <div class="card !p-3 text-center"><div class="text-xs text-slate-500">🟡 قرب ميعاده</div><div class="font-black text-amber-600">${soon.length}</div></div>
    <div class="card !p-3 text-center"><div class="text-xs text-slate-500">📅 إجمالي المستحقات</div><div class="font-black">${fmt(tot)}</div></div>`;
  const item=r=>{const d=daysUntil(r.date);const st=d<0?['متأخر '+(-d)+' يوم','bg-red-100 dark:bg-red-950 text-red-600']:d===0?['النهاردة!','bg-red-100 dark:bg-red-950 text-red-600']:d<=(r.before??3)?[`فاضل ${d} يوم`,'bg-amber-100 dark:bg-amber-950 text-amber-700']:['يوم '+fmtDate(r.date),'bg-slate-100 dark:bg-slate-800 text-slate-500'];
    return `<div class="tx-row"><div class="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950 flex items-center justify-center text-2xl">⏰</div>
    <div class="flex-1"><div class="font-bold">${esc(r.title)} <span class="text-[11px] px-2 py-0.5 rounded-full ${st[1]}">${st[0]}</span></div>
    <div class="text-xs text-slate-500">${fmtDate(r.date)} • ${r.repeat==='once'?'مرة واحدة':r.repeat==='monthly'?'شهري 🔁':r.repeat==='weekly'?'أسبوعي 🔁':'سنوي 🔁'}${r.cat?' • '+esc(r.cat):''}</div></div>
    <div class="font-black">${fmt(r.amount)}</div>
    <button onclick="payReminder('${r.id}')" class="bg-emerald-500 text-white text-xs font-black px-3 py-2 rounded-xl">سددت ✅</button>
    <button onclick="editReminder('${r.id}')" class="text-slate-400">✏️</button>
    <button onclick="delReminder('${r.id}')" class="text-slate-300 hover:text-red-500">×</button></div>`;};
  $('remindersList').innerHTML=(act.length?[...over,...soon,...later].map(item).join(''):'<p class="text-center text-slate-400 py-8">مفيش مستحقات — ضيف الإيجار والأقساط وفلوسي هيفكرك ⏰</p>')
    +(DB.reminders.filter(r=>r.done).length?`<div class="font-black text-sm mt-4 text-slate-500">✅ مدفوعة ومقفولة (${DB.reminders.filter(r=>r.done).length})</div>`:'');
}

// --- الديون ---
function renderDebts(){
  const owe=DB.debts.filter(d=>!d.done&&d.dir==='owe'), owed=DB.debts.filter(d=>!d.done&&d.dir==='owed');
  const sOwe=owe.reduce((s,d)=>s+(d.amount-d.paid),0), sOwed=owed.reduce((s,d)=>s+(d.amount-d.paid),0);
  $('debtsSummary').innerHTML=`<div class="card !p-4 text-center border-red-200"><div class="text-sm text-slate-500">🔴 عليّا (هدفع)</div><div class="font-black text-xl text-red-600">${fmt(sOwe)}</div></div>
  <div class="card !p-4 text-center border-emerald-200"><div class="text-sm text-slate-500">🟢 ليّا (هستلم)</div><div class="font-black text-xl text-emerald-600">${fmt(sOwed)}</div></div>`;
  $('debtsList').innerHTML=DB.debts.map(d=>{const rest=d.amount-d.paid;const pct=d.amount?d.paid/d.amount*100:0;
    return `<div class="tx-row"><div class="w-11 h-11 rounded-xl ${d.dir==='owe'?'bg-red-50 dark:bg-red-950':'bg-emerald-50 dark:bg-emerald-950'} flex items-center justify-center text-2xl">${d.dir==='owe'?'📤':'📥'}</div>
    <div class="flex-1"><div class="font-bold">${esc(d.person)} ${d.done?'<span class="text-[11px] bg-emerald-100 text-emerald-700 px-2 rounded-full">خالص ✅</span>':''}</div>
    <div class="text-xs text-slate-500">${esc(d.note||'')} • يستحق ${fmtDate(d.date)}</div>
    <div class="prog mt-1 max-w-[220px]"><div style="width:${pct}%;background:#10b981"></div></div>
    <div class="text-[11px] font-bold">مدفوع ${fmt(d.paid)} • فاضل ${fmt(rest)}</div></div>
    ${!d.done?`<button onclick="payDebt('${d.id}',false)" class="btn-ghost !text-xs">سداد جزئي</button><button onclick="payDebt('${d.id}',true)" class="bg-emerald-500 text-white text-xs font-black px-3 py-2 rounded-xl">خالص ✅</button>`:''}
    <button onclick="delDebt('${d.id}')" class="text-slate-300 hover:text-red-500">×</button></div>`}).join('')||'<p class="text-center text-slate-400 py-8">مفيش ديون مسجلة 🤝</p>';
}

function renderSettingsCats(){ $('catsManager').innerHTML=DB.cats.map(c=>`<span class="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl text-sm font-bold">${c.icon} ${esc(c.name)} <button onclick="delCategory('${c.id}')" class="text-red-400">×</button></span>`).join(''); }

// --- رسوم ---
function killChart(id){ if(charts[id]){charts[id].destroy();delete charts[id];} }
function renderCharts(){
  const list=monthTxs().filter(t=>t.type==='expense');
  const by={}; list.forEach(t=>by[t.cat]=(by[t.cat]||0)+ +t.amount);
  const labels=Object.keys(by).map(id=>catOf(id).name), vals=Object.values(by);
  const palette=['#7c3aed','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6','#8b5cf6','#f97316','#64748b'];
  killChart('cat'); killChart('trend');
  const dark=document.documentElement.classList.contains('dark');
  if($('catChart')) charts.cat=new Chart($('catChart'),{type:'doughnut',data:{labels,datasets:[{data:vals,backgroundColor:palette,borderWidth:0}]},options:{plugins:{legend:{display:false}},cutout:'62%'}});
  $('catLegend').innerHTML=labels.map((l,i)=>{const tot=vals.reduce((a,b)=>a+b,0)||1;return `<div class="flex justify-between"><span><span style="color:${palette[i%10]}">●</span> ${esc(l)}</span><b>${fmt(vals[i])} (${(vals[i]/tot*100).toFixed(0)}%)</b></div>`}).join('')||'<p class="text-xs text-slate-400">مفيش مصاريف الشهر ده</p>';
  // ترند 6 شهور
  const months=[];const now=new Date();
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push(d.toISOString().slice(0,7));}
  const eD=months.map(m=>DB.txs.filter(t=>t.type==='expense'&&t.date.startsWith(m)).reduce((s,t)=>s+ +t.amount,0));
  const iD=months.map(m=>DB.txs.filter(t=>t.type==='income'&&t.date.startsWith(m)).reduce((s,t)=>s+ +t.amount,0));
  if($('trendChart')) charts.trend=new Chart($('trendChart'),{type:'bar',data:{labels:months.map(m=>new Date(m+'-02').toLocaleDateString('ar-EG',{month:'short'})),datasets:[{label:'مصروف',data:eD,backgroundColor:'#f43f5e',borderRadius:8},{label:'دخل',data:iD,backgroundColor:'#10b981',borderRadius:8}]},options:{plugins:{legend:{labels:{color:dark?'#e2e8f0':'#475569'}}},scales:{x:{ticks:{color:dark?'#94a3b8':'#64748b'}},y:{ticks:{color:dark?'#94a3b8':'#64748b'}}}}});
}
function renderReports(){
  killChart('rc');killChart('rt');
  const list=monthTxs().filter(t=>t.type==='expense');
  const by={};list.forEach(t=>by[t.cat]=(by[t.cat]||0)+ +t.amount);
  const palette=['#7c3aed','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
  charts.rc=new Chart($('repCatChart'),{type:'pie',data:{labels:Object.keys(by).map(id=>catOf(id).name),datasets:[{data:Object.values(by),backgroundColor:palette}]},options:{plugins:{legend:{position:'bottom'}}}});
  const months=[];const now=new Date();
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push(d.toISOString().slice(0,7));}
  charts.rt=new Chart($('repTrendChart'),{type:'line',data:{labels:months,datasets:[{label:'المصروف',data:months.map(m=>DB.txs.filter(t=>t.type==='expense'&&t.date.startsWith(m)).reduce((s,t)=>s+ +t.amount,0)),borderColor:'#7c3aed',tension:.4,fill:true,backgroundColor:'rgba(124,58,237,.15)'}]},options:{plugins:{legend:{display:false}}}});
  const tot=Object.values(by).reduce((a,b)=>a+b,0)||1;
  $('topCats').innerHTML=Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([c,v])=>{const ct=catOf(c);return `<div><div class="flex justify-between text-sm font-bold"><span>${ct.icon} ${esc(ct.name)}</span><span>${fmt(v)}</span></div><div class="prog mt-1"><div style="width:${(v/tot*100).toFixed(0)}%;background:#7c3aed"></div></div></div>`}).join('')||'—';
  const pb={};DB.txs.filter(t=>t.type==='expense'&&t.project).forEach(t=>pb[t.project]=(pb[t.project]||0)+ +t.amount);
  $('projReport').innerHTML=Object.entries(pb).sort((a,b)=>b[1]-a[1]).map(([pid,v])=>{const p=projOf(pid);if(!p)return '';return `<div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 flex justify-between font-bold"><span>${p.icon} ${esc(p.name)}</span><span class="text-red-600">${fmt(v)}</span></div>`}).join('')||'مفيش مصاريف على مشاريع — اربط معاملاتك بمشروع 🏗️';
}
