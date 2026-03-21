import { describe, it, expect } from "vitest";
import { transactionSchema, supplierSchema, eventSchema, quotationSchema, validateForm } from "../validations";

describe("transactionSchema", () => {
  const valid = {
    description: "Test",
    type: "expense" as const,
    amount: "100",
    iva_rate: 23,
    date: "2024-01-15",
  };

  it("accepts valid transaction", () => {
    expect(transactionSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects empty description", () => {
    expect(transactionSchema.safeParse({ ...valid, description: "" }).success).toBe(false);
  });
  it("rejects negative amount", () => {
    expect(transactionSchema.safeParse({ ...valid, amount: "-5" }).success).toBe(false);
  });
  it("rejects zero amount", () => {
    expect(transactionSchema.safeParse({ ...valid, amount: "0" }).success).toBe(false);
  });
  it("rejects invalid date format", () => {
    expect(transactionSchema.safeParse({ ...valid, date: "15-01-2024" }).success).toBe(false);
  });
  it("rejects invalid type", () => {
    expect(transactionSchema.safeParse({ ...valid, type: "transfer" }).success).toBe(false);
  });
});

describe("supplierSchema", () => {
  it("accepts minimal supplier", () => {
    expect(supplierSchema.safeParse({ name: "Fornecedor" }).success).toBe(true);
  });
  it("rejects empty name", () => {
    expect(supplierSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("rejects invalid email", () => {
    expect(supplierSchema.safeParse({ name: "F", email: "not-email" }).success).toBe(false);
  });
  it("accepts empty email string", () => {
    expect(supplierSchema.safeParse({ name: "F", email: "" }).success).toBe(true);
  });
});

describe("eventSchema", () => {
  it("accepts valid event", () => {
    expect(eventSchema.safeParse({ name: "Concerto", date: "2024-06-01" }).success).toBe(true);
  });
  it("rejects negative budget", () => {
    expect(eventSchema.safeParse({ name: "X", date: "2024-01-01", budget: -1 }).success).toBe(false);
  });
  it("rejects invalid status", () => {
    expect(eventSchema.safeParse({ name: "X", date: "2024-01-01", status: "invalid" }).success).toBe(false);
  });
});

describe("quotationSchema", () => {
  const valid = {
    description: "Cotação",
    amount: 500,
    event_id: "550e8400-e29b-41d4-a716-446655440000",
    supplier_id: "550e8400-e29b-41d4-a716-446655440001",
    iva_rate: 23,
  };
  it("accepts valid quotation", () => {
    expect(quotationSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects non-uuid event_id", () => {
    expect(quotationSchema.safeParse({ ...valid, event_id: "abc" }).success).toBe(false);
  });
});

describe("validateForm helper", () => {
  it("returns success with parsed data", () => {
    const result = validateForm(eventSchema, { name: "Evento", date: "2024-01-01" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Evento");
  });
  it("returns field-level errors on failure", () => {
    const result = validateForm(eventSchema, { name: "", date: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveProperty("name");
      expect(result.errors).toHaveProperty("date");
    }
  });
});
