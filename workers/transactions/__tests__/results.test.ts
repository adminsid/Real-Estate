import { validateStageTransition } from '../../../worker/lib/stageGate'
import { describe,it,expect } from 'vitest'
import { transactionResults,resultsCsv } from '../results'
import { workflowPhases } from '../../../src/domain/workflow-template'
describe('result table and export contract',()=>{
 it('returns the same valid dated facts and excludes repair rows from totals',()=>{
  const base={assigned_to:'agent',type:'sale',status:'closed',commission_amount:1200}
  const report=transactionResults([{...base,id:'a',name:'A',actual_close_date:'2025-12-31'},{...base,id:'b',name:'=formula',actual_close_date:'2026-01-01'},
   {...base,id:'c',name:'Repair',actual_close_date:null}],new URLSearchParams({period:'custom',start:'2026-01-01',end:'2026-01-01'}))
  expect(report.rows.map(r=>r.id)).toEqual(['b']);expect(report.grossCommissionCents).toBe(120000);expect(report.repair).toEqual([{id:'c',name:'Repair'}])
  const csv=resultsCsv(report);expect(csv).toContain("'=formula");expect(csv.split('\r\n')).toHaveLength(2);expect(csv).toContain('120000')
 })
 it('uses lease milestones while preserving required documents and broker approval',()=>{
  expect(validateStageTransition('closed',{},[],'lease_v1').allowed).toBe(true)
  expect(validateStageTransition('closed',{},[],'legacy_v1').allowed).toBe(false)
  expect(validateStageTransition('closed',{},[{title:'Signed lease',attachment_required:1,document_key:null,broker_approval_required:1,broker_approval_status:'pending'}],'lease_v1').allowed).toBe(false)
 })
 it('keeps legacy phases while new lease workflows omit the board/loan phase',()=>{
  expect(workflowPhases('legacy_v1')).toContain('board_package');expect(workflowPhases('lease_v1')).not.toContain('board_package')
 })
})
