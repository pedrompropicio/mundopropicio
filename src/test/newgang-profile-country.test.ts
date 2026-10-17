import { describe, it, expect } from "vitest";
import { profileConfirm } from "../../supabase/functions/newgang-portal/profile";

describe("Newgang residence country error contract", () => {
  it("returns400 country_invalid for the canonical missing-country rejection", async () => {
    const result = await profileConfirm(async () => ({data:null,error:{message:"country_invalid"}}), "site", "hash", {confirm:true,birth_date:"1990-01-01",birth_country:"PT"});
    expect(result.status).toBe(400);
    expect(result.body).toEqual({error:"country_invalid"});
  });
  it("preserves a complete foreign profile with country BR and no city", async () => {
    const data={ok:true,awarded:50,profile:{birth_date:"1990-01-01",birth_country:"PT",residence_country:"BR",city:null,complete:true}};
    const result=await profileConfirm(async (_fn,args) => {
      expect(args.p_payload).toEqual({confirm:true,birth_date:"1990-01-01",birth_country:"PT",residence_country:"BR"});
      return {data,error:null};
    }, "site", "hash", {confirm:true,birth_date:"1990-01-01",birth_country:"PT",residence_country:"BR"});
    expect(result.status).toBe(200);
    expect(result.body).toEqual(data);
  });
});
