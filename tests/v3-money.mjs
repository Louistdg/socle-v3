import assert from 'node:assert/strict';
import '../web/v3-money.js';
const {centsFromInput}=globalThis.SOCLE_V3_MONEY;
for(const [input,expected] of [['0',0],['0.01',1],['0,29',29],['125,50',12550],['19.9',1990],['-123.45',-12345],[' 42,07 ',4207],['9999999999.99',999999999999]])assert.equal(centsFromInput(input),expected,input);
for(const input of ['','1e3','NaN','Infinity','1.234','12,345','1 000','1,2,3','10000000000','--1','+5','<script>'])assert.throws(()=>centsFromInput(input),undefined,input);
console.log('v3-money: 20 exact parsing and invalid-value checks passed.');
