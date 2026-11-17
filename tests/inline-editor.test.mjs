import test from 'node:test';import assert from 'node:assert/strict';
import {parseCourse,courseText,writeField,readField,editItems,editorDesign} from '../shared/editor.mjs';
import {sampleResume,validateResume,validateDesign} from '../shared/model.mjs';import {resumeHTML} from '../shared/render.mjs';
test('courses preserve issuer, month and multiline description across inline editing and bot-compatible strings',()=>{
 const value=courseText({name:'الأمن السيبراني',issuer:'جهة تدريب',date:'نوفمبر 2025',description:'تطبيق عملي\nإعداد شبكة تجريبية'});assert.deepEqual(parseCourse(value),{name:'الأمن السيبراني',issuer:'جهة تدريب',date:'نوفمبر 2025',description:'تطبيق عملي\nإعداد شبكة تجريبية'});
 const d={...sampleResume,courses:[value]};const next=writeField(d,'courses.0.description','وصف معدل');assert.equal(readField(next,'courses.0.issuer'),'جهة تدريب');assert.equal(parseCourse(validateResume(next).courses[0]).description,'وصف معدل');assert.equal(d.courses[0],value);
});
test('deleting an inline responsibility preserves its employer and remaps formatting on the remaining responsibility',()=>{
 const d=structuredClone(sampleResume);const path='experience.0.details',second=d.experience[0].details[1];const design={textFormats:{'experience.0.details.1':{text:second,marks:[{start:0,end:4,bold:true}]}}};const result=editItems(d,design,path,0,'delete');assert.equal(result.data.experience.length,1);assert.equal(result.data.experience[0].details.length,1);assert.equal(result.data.experience[0].details[0],second);assert.equal(result.design.textFormats['experience.0.details.0'].text,second);assert.equal(d.experience[0].details.length,2);
});
test('section ordering, hiding and text formatting are shared by the PDF renderer',()=>{
 const d={...sampleResume,summary:'نص مهم للمراجعة'};const design={order:['courses','summary'],hidden:['skills'],textFormats:{summary:{text:d.summary,marks:[{start:0,end:6,bold:true,href:'https://example.com/apply'}]}}};const html=resumeHTML(d,design);assert.ok(html.indexOf('data-section="courses"')<html.indexOf('data-section="summary"'));assert.doesNotMatch(html,/data-section="skills"/);assert.match(html,/<a href="https:\/\/example.com\/apply"><strong>/);assert.match(html,/data-field="courses.0.name"/);
});
test('rich formatting cannot introduce markup, unsafe URLs, arbitrary CSS or prototype paths',()=>{
 const d={...sampleResume,summary:'<script>bad</script>'};const design=validateDesign({sections:{summary:{fontSize:'100;display:none',color:'red'}},textFormats:{summary:{text:d.summary,marks:[{start:0,end:7,href:'javascript:alert(1)',bold:true}]}}});const html=resumeHTML(d,design);assert.doesNotMatch(html,/<script>|javascript:|100;display:none/);assert.equal(design.sections.summary.fontSize,undefined);assert.match(html,/&lt;script/);assert.throws(()=>writeField(d,'__proto__.polluted','x'));assert.throws(()=>editItems(d,{},'__proto__',0,'delete'));assert.equal(editorDesign({hidden:['__proto__']}).hidden.length,0);
});
test('formatting tied to old text is ignored after a bot or AI edit',()=>{
 const html=resumeHTML({...sampleResume,summary:'نص جديد'},{textFormats:{summary:{text:'نص قديم',marks:[{start:0,end:3,href:'https://example.com/old'}]}}});assert.doesNotMatch(html,/example.com\/old/);
});
