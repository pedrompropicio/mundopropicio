import { describe,expect,it } from 'vitest';
import { changeDestination,forecastSuggestions } from '../ads-invoice-suggestions';
describe('#486 human BP suggestions',()=>{
  it('filters tenant-loaded event/category/status/currency options and never ranks by greatest budget',()=>{
    const f=(id:string,amount:number,event_id='E',category_id='C',status='approved',currency='EUR')=>({id,amount,event_id,category_id,status,currency,description:'Finalidade',specification:null});
    expect(forecastSuggestions([f('b',999999),f('a',10),f('c',20,'other'),f('d',20,'E','other'),f('e',20,'E','C','draft'),f('f',20,'E','C','approved','USD')],'E','C').map(f=>f.id)).toEqual(['a','b']);
  });
  it('clears old BP on every destination/event change while retaining signed amount and reason',()=>{
    const a={key:'fee',line_id:'line',destination:'event' as const,amount:'-5.00',observation:'Ajuste explícito',event_id:'old',forecast_id:'old-bp'};
    expect(changeDestination(a,'company')).toEqual({key:'fee',line_id:'line',destination:'company',amount:'-5.00',observation:'Ajuste explícito'});
    expect(changeDestination(a,'event','new')).toEqual({key:'fee',line_id:'line',destination:'event',amount:'-5.00',observation:'Ajuste explícito',event_id:'new'});
  });
});
