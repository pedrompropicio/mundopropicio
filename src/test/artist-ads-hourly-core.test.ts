// @vitest-environment node
import { describe,it,expect } from 'vitest';
import { counter,cents,accountDay,daysForRun,deviceOs,paginate } from '../../supabase/functions/_shared/artist-ads-hourly-core';
describe('Traffic hourly rules',()=>{
 it('null is not zero',()=>{expect(counter(null)).toBeNull();expect(counter('')).toBeNull();expect(counter('0')).toBe(0);expect(cents(null)).toBeNull();expect(cents('29.63')).toBe(2963);});
 it('uses account civil date, not UTC',()=>{const now=new Date('2026-10-21T01:00:00Z');expect(accountDay(now,'America/Sao_Paulo')).toBe('2026-10-20');expect(accountDay(now,'Europe/Lisbon')).toBe('2026-10-21');});
 it('15 UTC closes D-1, 01 UTC and manual collect only today',()=>{expect(daysForRun(new Date('2026-10-21T15:00:00Z'),'America/Sao_Paulo','scheduled')).toEqual(['2026-10-21','2026-10-20']);expect(daysForRun(new Date('2026-10-21T01:00:00Z'),'America/Sao_Paulo','scheduled')).toEqual(['2026-10-20']);expect(daysForRun(new Date('2026-10-21T15:00:00Z'),'America/Sao_Paulo','today')).toEqual(['2026-10-21']);});
 it('backfill has exactly 14 or 30 inclusive account days',()=>{const now=new Date('2026-10-21T15:00:00Z');const h=daysForRun(now,'America/Sao_Paulo','backfill',14);expect(h).toHaveLength(14);expect(h[13]).toBe('2026-10-08');expect(daysForRun(now,'America/Sao_Paulo','backfill',30)[29]).toBe('2026-09-22');});
 it('does not infer mobile or Mac as iOS',()=>{expect(deviceOs('iPhone')).toBe('iOS');expect(deviceOs('android_smartphone')).toBe('Android');expect(deviceOs('mobile')).toBe('other');expect(deviceOs('Mac')).toBe('other');});
 it('follows more than 50 pages',async()=>{const rows=await paginate('1',async c=>({rows:[Number(c)],next:Number(c)<51?String(Number(c)+1):undefined}));expect(rows).toHaveLength(51);expect(rows[50]).toBe(51);});
 it('fails rather than commits truncated pages',async()=>{await expect(paginate('1',async c=>{if(c==='2')throw new Error('rate_limit');return {rows:[1],next:'2'};})).rejects.toThrow('rate_limit');});
 it('unknown timezone fails closed',()=>{expect(()=>accountDay(new Date(),'unknown-zone')).toThrow();});
});