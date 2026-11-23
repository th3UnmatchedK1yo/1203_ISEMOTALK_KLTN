import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { assertLoopbackPortsAvailable } from './demo-runtime.mjs'
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = process.env.ISEMO_BROWSER_OUTPUT || path.join(os.tmpdir(),'isemo-browser-artifacts')
fs.mkdirSync(outputDir,{recursive:true})
const require = createRequire(path.join(repo,'package.json'))
const { chromium } = require(process.env.ISEMO_PLAYWRIGHT_PATH || 'playwright')
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(),'isemo-service-ui-'))
const children=[]
const logs=[]
const start=(exe,args,extra={})=>{const child=spawn(exe,args,{cwd:repo,env:{...process.env,ISEMO_DATA_DIR:dataDir,ISEMO_AUTO_SEED:'0',...extra},stdio:['ignore','pipe','pipe']});children.push(child);child.stdout.on('data',d=>logs.push(String(d)));child.stderr.on('data',d=>logs.push(String(d)));return child}
const base='http://127.0.0.1:5173'
const api='http://127.0.0.1:3001'
const waitHttp=async url=>{for(let i=0;i<120;i++){try{const r=await fetch(url);if(r.ok)return}catch{} await new Promise(r=>setTimeout(r,100))}throw Error('Startup timeout '+url+'\n'+logs.join(''))}
const json=async(url,body,method='POST')=>{const r=await fetch(api+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();assert(r.ok,JSON.stringify(d));return d}
const local=(offset)=>new Date(Date.now()+offset).toISOString().slice(0,16)
const evidence={checks:[],errors:[],screenshots:[]}
let browser
try{
 await assertLoopbackPortsAvailable([3001,5173])
 start(process.execPath,['--import','tsx','server/src/index.ts'])
 start(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5173','--strictPort'])
 await Promise.all([waitHttp(api+'/api/cases'),waitHttp(base)])
 browser=await chromium.launch({...(process.env.ISEMO_BROWSER_EXECUTABLE ? {executablePath:process.env.ISEMO_BROWSER_EXECUTABLE} : {}),headless:true})
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'})
 const page=await context.newPage()
 page.on('pageerror',e=>evidence.errors.push(e.message))
 page.on('console',m=>{if(m.type()==='error')(evidence.consoleErrors ??= []).push(m.text())})
 await page.goto(base+'/cases')
 await page.getByRole('link',{name:'Tạo vụ việc',exact:true}).click()
 await page.getByLabel(/^Tiêu đề vụ việc \*/).fill('Hoàn tiền đơn ORD-DEMO-142 chưa về tài khoản')
 await page.getByLabel(/^Nội dung cần xử lý/).fill('Khách đề nghị gọi lại về thời hạn hoàn tiền; đây là dữ liệu mô phỏng nghiệp vụ.')
 await page.getByLabel(/^Tên khách hàng/).fill('Khách demo')
 await page.getByLabel(/^Người phụ trách vụ việc/).fill('Lan demo')
 await page.getByLabel(/^Người ghi nhận \*/).fill('QA demo')
 await page.getByRole('button',{name:'Dùng giờ hiện tại',exact:true}).click()
 await page.getByRole('checkbox',{name:'Giao việc tiếp theo'}).check()
 await page.getByLabel(/^Việc cần làm \*/).fill('Gọi khách xác nhận yêu cầu hoàn tiền')
 await page.getByLabel(/^Giao cho \*/).fill('Lan demo')
 await page.getByLabel(/^Hạn thực hiện \*/).fill(local(3600000))
 await page.getByRole('button',{name:'Tạo vụ việc và lưu thông tin',exact:true}).click()
 await page.waitForURL(/\/cases\/CASE-/)
 const caseId=page.url().split('/').at(-1)
 await page.getByRole('heading',{name:'Việc cần làm',exact:true}).waitFor()
 await page.getByLabel(/^Người ghi nhận cho các thao tác \*/).fill('QA demo')
 evidence.checks.push('Created manual callback case + task atomically from browser, no analysis call created')
 assert.equal((await (await fetch(api+'/api/calls')).json()).total,0)
 await page.getByRole('button',{name:'Ghi nhận kết quả gọi lại',exact:true}).click()
 const callback=page.locator('form').filter({has:page.getByRole('heading',{name:'Kết quả cuộc gọi do nhân viên thực hiện'})})
 await callback.getByLabel(/^Thời điểm thử gọi \*/).fill(local(-60000))
 await callback.getByLabel(/^Ghi nhận kết quả \*/).fill('Khách không nghe máy; sẽ thử lại theo lịch.')
 await callback.getByLabel(/^Hạn thử lại \*/).fill(local(7200000))
 await callback.getByRole('button',{name:'Lưu kết quả gọi lại'}).click()
 await page.getByText('Đã lưu lần gọi chưa kết nối và hạn thử lại; công việc vẫn đang chờ.',{exact:true}).waitFor()
 let detail=await (await fetch(api+'/api/cases/'+caseId)).json()
 assert.equal(detail.case.status,'open');assert.equal(detail.tasks[0].status,'pending');assert.equal(detail.attempts.length,1)
 evidence.checks.push('No answer appends attempt, keeps pending and reschedules')
 await page.getByRole('button',{name:'Ghi nhận kết quả gọi lại',exact:true}).click()
 await callback.getByLabel(/^Kết quả/).selectOption('connected')
 await callback.getByLabel(/^Thời điểm thử gọi \*/).fill(local(0))
 await callback.getByLabel(/^Ghi nhận kết quả \*/).fill('Đã trao đổi, khách cần kế toán xác nhận hoàn tiền.')
 await callback.getByRole('button',{name:'Lưu kết quả gọi lại'}).click()
 await page.getByText('Đã hoàn thành việc gọi lại. Trạng thái vụ việc vẫn do người phụ trách xác nhận.',{exact:true}).waitFor()
 detail=await (await fetch(api+'/api/cases/'+caseId)).json()
 assert.equal(detail.case.status,'open');assert.equal(detail.tasks[0].status,'completed')
 evidence.checks.push('Connected completes callback only; case stays open')
 const addTask=page.locator('details').filter({has:page.locator('summary').getByText('Giao thêm việc',{exact:true})})
 await addTask.locator('summary').click()
 await addTask.getByLabel(/^Loại việc/).selectOption('backoffice')
 await addTask.getByLabel(/^Việc cần làm \*/).fill('Đối chiếu mã giao dịch hoàn tiền')
 await addTask.getByLabel(/^Giao cho \*/).fill('Kế toán demo')
 await addTask.getByLabel(/^Hạn thực hiện \*/).fill(local(10800000))
 await addTask.getByRole('button',{name:'Giao việc',exact:true}).click()
 await page.getByText('Đã giao việc. Nhân viên thực hiện cuộc gọi hoặc xử lý qua hệ thống nghiệp vụ.',{exact:true}).waitFor()
 const editor=page.locator('details').filter({has:page.locator('summary').getByText('Cập nhật / giải quyết vụ việc',{exact:true})})
 await editor.locator('summary').click()
 await editor.getByLabel(/^Trạng thái vụ việc/).selectOption('resolved')
 await editor.getByLabel(/^Kết quả xử lý \*/).fill('Chưa được phép đóng khi còn việc chờ')
 await editor.getByRole('button',{name:'Lưu hồ sơ vụ việc',exact:true}).click()
 await page.locator('[role="alert"]').filter({hasText:'việc'}).first().waitFor()
 detail=await (await fetch(api+'/api/cases/'+caseId)).json();assert.equal(detail.case.status,'open')
 evidence.checks.push('Pending work blocks premature case resolution; draft retained')
 page.once('dialog',d=>d.accept())
 await editor.getByRole('button',{name:'Bỏ bản nháp / nạp dữ liệu đã lưu',exact:true}).click()
 await page.getByRole('button',{name:'Cập nhật / hoàn thành',exact:true}).click()
 const taskEditor=page.locator('form:visible').filter({has:page.getByRole('button',{name:'Lưu công việc',exact:true})})
 await taskEditor.getByLabel(/^Trạng thái công việc/).selectOption('completed')
 await taskEditor.getByLabel(/^Ghi nhận kết quả/).fill('Mã giao dịch DEMO-REF-142 đã được đối chiếu.')
 await taskEditor.getByRole('button',{name:'Lưu công việc',exact:true}).click()
 await page.getByText('Đã lưu công việc và lịch sử thay đổi.',{exact:true}).waitFor()
 await editor.getByLabel(/^Trạng thái vụ việc/).selectOption('resolved')
 await editor.getByLabel(/^Kết quả xử lý \*/).fill('Khách đã được thông báo ngày nhận tiền và xác nhận kết thúc yêu cầu demo.')
 await editor.getByRole('button',{name:'Lưu hồ sơ vụ việc',exact:true}).click()
 await page.getByText('Đã lưu hồ sơ vụ việc và lịch sử.',{exact:true}).waitFor()
 detail=await (await fetch(api+'/api/cases/'+caseId)).json();assert.equal(detail.case.status,'resolved');assert(detail.case.resolvedAt)
 const exported=await(await fetch(api+'/api/cases/'+caseId+'/export.json')).json()
 assert.equal(exported.history.length,detail.case.version)
 evidence.checks.push('Backoffice completion + explicit case resolution; full-history JSON export')
 // Capture the ordinary read view after completing the workflow, with navigation at the top.
 const openSummaries=page.locator('details[open] > summary')
 while(await openSummaries.count()) await openSummaries.first().click()
 await page.evaluate(()=>window.scrollTo(0,0))
 const screenshot=path.join(outputDir,'case-desktop.png')
 await page.screenshot({path:screenshot,fullPage:true});evidence.screenshots.push(screenshot)
 await page.setViewportSize({width:390,height:844})
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Detail page overflows mobile viewport')
 const mobile=path.join(outputDir,'case-mobile.png')
 await page.screenshot({path:mobile,fullPage:true});evidence.screenshots.push(mobile)
 evidence.checks.push('Desktop1440 and mobile390 detail layout; no page-level horizontal overflow')

 // Visual QA for the call-review workspace. The source is a CI-only fixture,
 // never real customer audio or evidence of model accuracy.
 const qaForm = new FormData()
 qaForm.append('results', new Blob([JSON.stringify({
   call: {title:'TTS TỔNG HỢP · OneVoice · CI UI FIXTURE'},
   utterances:[{
     speaker:'unknown',start:0,end:20,
     text:'agent: Chào chị, em có thể hỗ trợ gì?\\ncustomer: Tôi không vào được tài khoản, xin kiểm tra giúp.\\nagent: Em sẽ kiểm tra và liên hệ lại.'
   }],
 })], {type:'application/json'}), 'onevoice-ui-fixture.json')
 const qaUpload = await fetch(api+'/api/calls/import',{method:'POST',body:qaForm})
 assert.equal(qaUpload.status,202)
 const {id: qaCallId}=await qaUpload.json()
 let qaReady=false
 for(let i=0;i<80;i++){
   const detail=await(await fetch(api+'/api/calls/'+qaCallId)).json()
   if(detail.status==='ready'){qaReady=true;break}
   await new Promise(resolve=>setTimeout(resolve,100))
 }
 assert(qaReady,'CI-only QA source import did not finalize')
 await page.setViewportSize({width:1440,height:900})
 await page.goto(base+'/calls/'+qaCallId)
 await page.getByRole('navigation',{name:'Các bước xem xét cuộc gọi'}).waitFor()
 await page.getByRole('heading',{name:/Hội thoại nguồn/}).waitFor()
 await page.getByRole('heading',{name:'Kết luận của người QA'}).waitFor()
 await page.getByRole('heading',{name:'Cuộc gọi có cần xem kỹ?'}).waitFor()
 assert.equal(await page.getByText('21 lượt lời kịch bản').count(),0)
 assert(await page.getByText('Nhân viên (nhãn kịch bản)',{exact:true}).count()>0)
 assert(await page.getByText('Khách hàng (nhãn kịch bản)',{exact:true}).count()>0)
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Call review overflows desktop')
 await page.screenshot({path:path.join(outputDir,'call-review-desktop.png'),fullPage:true})
 await page.setViewportSize({width:390,height:844})
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Call review overflows mobile 390')
 await page.screenshot({path:path.join(outputDir,'call-review-mobile.png'),fullPage:true})
 await page.getByRole('navigation',{name:'Các bước xem xét cuộc gọi'}).getByRole('link',{name:/Kết luận QA/}).click()
 assert.equal(new URL(page.url()).hash,'#call-review')
 await page.getByLabel('Nhận xét của QA').fill('Khách chưa đăng nhập được; QA cần xác minh hướng hỗ trợ.')
 await page.getByRole('checkbox',{name:/Đã kiểm tra và hoàn tất đánh giá QA/}).check()
 await page.getByRole('button',{name:'Lưu đánh giá QA'}).click()
 await page.getByText('Đã lưu đánh giá.',{exact:false}).first().waitFor()
 evidence.checks.push('Call review: chat speaker turns, guidance anchors, form save, desktop/mobile 390 no overflow')
 evidence.screenshots.push(path.join(outputDir,'call-review-desktop.png'),path.join(outputDir,'call-review-mobile.png'))

 // Actual browser history must protect input even when sessionStorage is unavailable.
 const noStorage=await browser.newContext({viewport:{width:1366,height:900}})
 await noStorage.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Blocked for test','SecurityError')}})
 const guardPage=await noStorage.newPage()
 await guardPage.goto(base+'/cases')
 await guardPage.getByRole('link',{name:'Tạo vụ việc',exact:true}).click()
 await guardPage.getByLabel(/^Tiêu đề vụ việc \*/).fill('Giữ bản đang nhập khi quay lại')
 const backDialog=guardPage.waitForEvent('dialog')
 const back=guardPage.goBack().catch(()=>null)
 await (await backDialog).dismiss();await back
 await guardPage.getByLabel(/^Tiêu đề vụ việc \*/).waitFor()
 assert.equal(await guardPage.getByLabel(/^Tiêu đề vụ việc \*/).inputValue(),'Giữ bản đang nhập khi quay lại')
 evidence.checks.push('Browser Back cancel preserves form with storage blocked')
 const active=await json('/api/cases',{title:'Kiểm tra xung đột hai người',actor:'QA seed',task:{kind:'callback',action:'Gọi xác nhận',owner:'Lan demo',dueAt:new Date(Date.now()+3600000).toISOString()}})
 // Full navigation intentionally discards the previous test page after its unsaved warning.
 guardPage.once('dialog',d=>d.accept())
 await guardPage.goto(base+'/cases/'+active.case.id)
 await guardPage.getByLabel(/^Người ghi nhận cho các thao tác \*/).fill('QA tab A')
 await guardPage.getByRole('button',{name:'Ghi nhận kết quả gọi lại',exact:true}).click()
 const draftForm=guardPage.locator('form:visible').filter({has:guardPage.getByRole('heading',{name:'Kết quả cuộc gọi do nhân viên thực hiện'})})
 await draftForm.getByLabel(/^Kết quả/).selectOption('connected')
 await draftForm.getByLabel(/^Thời điểm thử gọi \*/).fill(local(-60000))
 await draftForm.getByLabel(/^Ghi nhận kết quả \*/).fill('Bản nháp cần giữ khi người khác đã hoàn thành')
 // Toggle forms without unmounting the only in-memory draft.
 await guardPage.getByRole('button',{name:'Sửa hạn / phân công / hủy',exact:true}).click()
 await guardPage.getByRole('button',{name:'Ghi nhận kết quả gọi lại',exact:true}).click()
 assert.equal(await draftForm.getByLabel(/^Ghi nhận kết quả \*/).inputValue(),'Bản nháp cần giữ khi người khác đã hoàn thành')
 await json(`/api/cases/${active.case.id}/tasks/${active.tasks[0].id}/attempts`,{actor:'QA tab B',baseVersion:active.case.version,outcome:'connected',note:'Người khác đã hoàn thành'})
 await draftForm.getByRole('button',{name:'Lưu kết quả gọi lại'}).click()
 await guardPage.getByRole('button',{name:'Nạp phiên bản mới',exact:true}).click()
 await guardPage.getByText('Công việc đã kết thúc. Bản nháp còn giữ có thể tải về để đối chiếu.',{exact:true}).waitFor()
 assert.equal(await draftForm.getByLabel(/^Ghi nhận kết quả \*/).inputValue(),'Bản nháp cần giữ khi người khác đã hoàn thành')
 assert(await draftForm.getByRole('button',{name:'Tải bản nháp',exact:true}).isVisible())
 assert(await draftForm.getByRole('button',{name:'Lưu kết quả gọi lại',exact:true}).isDisabled())
 evidence.checks.push('Task closed by second operator: stale draft remains exportable with storage blocked; toggle preserves text')
 let promptCount=0
 const dismiss=d=>{promptCount++;void d.dismiss()}
 guardPage.on('dialog',dismiss)
 const caseEdit=guardPage.locator('details').filter({has:guardPage.locator('summary').getByText('Cập nhật / giải quyết vụ việc',{exact:true})})
 await caseEdit.locator('summary').click()
 await caseEdit.getByLabel(/^Nội dung cần xử lý/).fill('Bản nháp thứ hai')
 await guardPage.getByRole('link',{name:'Danh sách vụ việc',exact:true}).click()
 await guardPage.waitForTimeout(100)
 assert.equal(promptCount,1)
 assert(guardPage.url().endsWith('/cases/'+active.case.id))
 guardPage.off('dialog',dismiss)
 evidence.checks.push('Two dirty forms prompt exactly once on a route transition')
 await noStorage.close()

 // A response belonging to an unmounted creator must not redirect or erase its successor.
 const slowPage=await context.newPage()
 let release
 let started
 const held=new Promise(r=>{release=r})
 const requestStarted=new Promise(r=>{started=r})
 let holdNext=true
 await slowPage.route('**/api/cases',async route=>{if(route.request().method()==='POST' && holdNext){holdNext=false;started();await held}await route.continue()})
 await slowPage.goto(base+'/cases/new')
 await slowPage.getByLabel(/^Tiêu đề vụ việc \*/).fill('Tạo chậm trước đó')
 await slowPage.getByLabel(/^Người ghi nhận \*/).fill('QA slow')
 await slowPage.getByRole('checkbox',{name:'Ghi nhận lần liên hệ đầu tiên'}).uncheck()
 await slowPage.getByRole('button',{name:'Tạo vụ việc và lưu thông tin',exact:true}).click()
 await requestStarted
 slowPage.once('dialog',d=>d.accept())
 await slowPage.getByRole('navigation',{name:'Điều hướng chính'}).getByRole('link',{name:'Vụ việc',exact:true}).click()
 await slowPage.getByRole('link',{name:'Tạo vụ việc',exact:true}).click()
 await slowPage.getByLabel(/^Tiêu đề vụ việc \*/).fill('Bản nháp mới phải được giữ')
 const finished=slowPage.waitForResponse(r=>r.url()===base+'/api/cases' && r.request().method()==='POST')
 release()
 const firstResponse=await finished
 assert.equal(firstResponse.status(),201)
 const firstCreated=await firstResponse.json()
 await slowPage.waitForTimeout(150)
 assert(slowPage.url().endsWith('/cases/new'))
 assert.equal(await slowPage.getByLabel(/^Tiêu đề vụ việc \*/).inputValue(),'Bản nháp mới phải được giữ')
 assert((await slowPage.evaluate(()=>sessionStorage.getItem('isemotalk.service.new-case-manual'))).includes('Bản nháp mới phải được giữ'))
 evidence.checks.push('Delayed create response cannot navigate away from or clear a newer draft')
 // The old key now identifies a committed case. Recover deliberately without losing edits.
 const conflict=slowPage.waitForResponse(r=>r.url()===base+'/api/cases' && r.request().method()==='POST')
 await slowPage.getByRole('button',{name:'Tạo vụ việc và lưu thông tin',exact:true}).click()
 assert.equal((await conflict).status(),409)
 await slowPage.getByRole('button',{name:'Tạo thành vụ việc mới',exact:true}).waitFor()
 assert(await slowPage.locator(`a[href="/cases/${firstCreated.case.id}"]`).isVisible())
 await slowPage.getByRole('button',{name:'Tạo thành vụ việc mới',exact:true}).click()
 assert.equal(await slowPage.getByLabel(/^Tiêu đề vụ việc \*/).inputValue(),'Bản nháp mới phải được giữ')
 await slowPage.getByRole('button',{name:'Tạo vụ việc và lưu thông tin',exact:true}).click()
 await slowPage.waitForURL(/\/cases\/CASE-/)
 assert.notEqual(slowPage.url().split('/').at(-1),firstCreated.case.id)
 for(const title of ['Tạo chậm trước đó','Bản nháp mới phải được giữ']){
  const cases=await(await fetch(api+'/api/cases?search='+encodeURIComponent(title))).json()
  assert.equal(cases.total,1,`Expected one intended case for ${title}`)
  assert.equal(cases.items[0].title,title)
 }
 evidence.checks.push('Committed create key conflict links original case; explicit new-case action preserves edited fields and creates each intended case once')
 await slowPage.close()
 assert.equal(evidence.errors.length,0,'Browser JavaScript errors: '+evidence.errors.join('; '))
 evidence.caseId=caseId;evidence.finalVersion=detail.case.version
 await browser.close();browser=null
 fs.writeFileSync(path.join(outputDir,'result.json'),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify(evidence,null,2))
}catch(e){console.error(e);console.error(logs.slice(-20).join(''));if(browser){for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:path.join(outputDir,'failure.png'),fullPage:true}).catch(()=>{});}process.exitCode=1}
finally{if(browser)await browser.close();for(const c of children)c.kill('SIGTERM');await Promise.all(children.map(c=>c.exitCode!==null?Promise.resolve():new Promise(resolve=>{c.once('exit',resolve);setTimeout(resolve,5000).unref()})));fs.rmSync(dataDir,{recursive:true,force:true})}
