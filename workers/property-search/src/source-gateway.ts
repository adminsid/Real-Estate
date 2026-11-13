import { DurableObject } from 'cloudflare:workers'
import { dispatchSource } from './source-dispatch.mjs'

type Dispatch = {url: string; kind: string; jobId?: string; token?: string; mediaKey?: string; mediaRevision?: string}
type Pending = {input:Dispatch; resolve:(value:Awaited<ReturnType<typeof dispatchSource>>)=>void; reject:(reason:unknown)=>void}

// One per MLS subscription, only for upstream work. Consumer reads never pass here.
export class SourceGateway extends DurableObject<Env> {
  private pending:Pending[]=[]
  private running=false
  private slot=0

  dispatch(input: Dispatch) {
    return new Promise<Awaited<ReturnType<typeof dispatchSource>>>((resolve,reject)=>{
      this.pending.push({input,resolve,reject})
      if(!this.running)this.ctx.waitUntil(this.drain())
    })
  }

  private async drain(){
    this.running=true
    try{
      while(this.pending.length){
        // Due facts always win the next slot. Optional traffic shares the idle
        // slots 5:2, borrowing when a class is empty; D1 retains crash recovery.
        const preferred=['gallery','gallery','cover','gallery','gallery','cover','gallery'][this.slot++%7]
        let index=this.pending.findIndex(item=>item.input.kind==='core')
        if(index<0)index=this.pending.findIndex(item=>item.input.kind===preferred)
        if(index<0)index=0
        const item=this.pending.splice(index,1)[0]
        try{item.resolve(await dispatchSource(this.env,item.input))}catch(error){item.reject(error)}
      }
    }finally{this.running=false}
  }
}
