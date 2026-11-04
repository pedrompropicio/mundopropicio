import { useCompanyLocale } from "@/hooks/useCompanyLocale";
import { useCompany } from "@/hooks/useCompany";
import { COUNTRIES } from "@/lib/crm/countries";
import { formatBrTaxId, isForeignSupplier, readSupplierCountry, readForeignBankSlots, SUPPLIER_BANK_READ_ROLES, type ForeignBankSlot, type SupplierCountryReader } from "@/lib/supplier-bank";
import { BR_BANK_FIELDS, BrBankFields, FOREIGN_BANK_FIELDS, ForeignBankFields, readBrBankSlots, loadOptionalSupplierBrData, type BrBankDetails } from "@/components/SupplierBankDetails";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supplierSchema, validateForm } from "@/lib/validations";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit, getAuditUser } from "@/lib/audit";
import { cn } from "@/lib/utils";
import { IbanWarning } from "@/components/IbanWarning";
import { normalizeIban, validateIban, ibanWarningMessage } from "@/lib/iban";
import { classifyBankAccountValue, blocksSubmit, bankAccountValueToStore } from "@/lib/bank-account-value";
import { SupplierPortalUserLink } from "@/components/SupplierPortalUserLink";
import { reactivateSupplier } from "@/lib/supplier-lifecycle";
import { SimilarSuppliersNotice, type SimilarSupplier } from "@/components/SimilarSuppliersNotice";
import { blockImplicitSubmitOnEnter } from "@/lib/form-enter-guard";

const supplierCategories = [
  "Som e Iluminação",
  "Palco e Estruturas",
  "Vídeo e LED",
  "Backline e Instrumentos",
  "Catering e Alimentação",
  "Segurança e Controlo de Acessos",
  "Transportes e Logística",
  "Alojamento e Hotelaria",
  "Artistas e Agências",
  "Produção e Técnicos",
  "Marketing e Comunicação",
  "Assessoria de Imprensa",
  "Design e Sinalização",
  "Bilhética e Plataformas",
  "Seguros",
  "Direitos Autorais e Licenças",
  "Decoração e Cenografia",
  "Limpeza e Manutenção",
  "Locação de Espaços",
  "Serviços Jurídicos e Contabilidade",
  "Outro",
];


interface SupplierFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
  editingSupplier?: any;
  defaultIsPartner?: boolean;
  overlayClassName?: string;
  contentClassName?: string;
}

export function SupplierFormModal({ open, onOpenChange, onCreated, editingSupplier, defaultIsPartner, overlayClassName, contentClassName }: SupplierFormModalProps) {
  const queryClient = useQueryClient();
  const { user, role } = useAuth() as any;
  const isEditing = !!editingSupplier;
  const companyLocale = useCompanyLocale();
  const { company } = useCompany();
  const companyCountry = company?.country ?? null;
  const countryScope = JSON.stringify([companyLocale.companyId, editingSupplier?.id, role, user?.id]);
  const [countryDraft, setCountryDraft] = useState<{ scope: string; value: string } | null>(null);
  const { data: savedCountry, isFetched: countryFetched } = useQuery({
    queryKey: ["supplier-country", companyLocale.companyId, editingSupplier?.id, role, user?.id],
    enabled: open && isEditing && !!companyLocale.companyId,
    queryFn: () => readSupplierCountry(supabase as unknown as SupplierCountryReader, editingSupplier.id),
    refetchOnWindowFocus: false,
    retry: false,
  });
  const supplierCountry = countryDraft?.scope === countryScope ? countryDraft.value
    : (isEditing ? savedCountry : null) ?? companyCountry ?? "";
  const isForeign = isForeignSupplier(supplierCountry || null, companyCountry);
  useEffect(() => {
    if (open) setCountryDraft(null);
  }, [open, countryScope]);
  const isBR = companyLocale.status === "available" && companyLocale.locale === "pt-BR";
  const canReadBank = SUPPLIER_BANK_READ_ROLES.includes(role ?? "");
  const [brBanks, setBrBanks] = useState<BrBankDetails[]>([{}, {}, {}]);
  const [iban1, setIban1] = useState<string>(editingSupplier?.iban ?? "");
  const [iban2, setIban2] = useState<string>(editingSupplier?.iban_2 ?? "");
  const [iban3, setIban3] = useState<string>(editingSupplier?.iban_3 ?? "");
  // Country alone decides whether the supplier is foreign. The classifier only
  // distinguishes the individual IBAN slots from the non-IBAN slot editors.
  const foreignSlots = [iban1, iban2, iban3].map((value, index) => isForeign && !isBR
    && (classifyBankAccountValue(value) === "nao_iban" || (index === 0 && !iban1 && !iban2 && !iban3)));
  const { data: brData } = useQuery({
    queryKey: ["supplier-br-details", companyLocale.companyId, editingSupplier?.id, role, user?.id],
    enabled: open && isForeign && !!companyLocale.companyId,
    queryFn: () => loadOptionalSupplierBrData(editingSupplier?.id),
    refetchOnWindowFocus: false,
    retry: false,
  });
  const brColumnsReady = isForeign && isBR && canReadBank && !!companyLocale.companyId && brData?.available === true;
  const brSource = brColumnsReady ? brData.details : null;
  const [brTaxId, setBrTaxId] = useState("");
  const [brTaxIdType, setBrTaxIdType] = useState("cnpj");
  const [brTaxIdEdited, setBrTaxIdEdited] = useState(false);
  const occupiedForeignSlots = new Set<number>((Array.isArray(brSource?.foreign_bank_accounts) ? brSource.foreign_bank_accounts : [])
    .filter((bank: any) => bank && bank.account_type !== "br_banco_agencia_conta").map((bank: any) => bank.slot));
  const foreignColumnsReady = isForeign && !isBR && canReadBank && !!companyLocale.companyId && brData?.available === true;
  const foreignSource = foreignColumnsReady ? brData.details : null;
  const [foreignBanks, setForeignBanks] = useState<ForeignBankSlot[]>(
    () => [1, 2, 3].map(slot => ({ slot, account_type: "outro" })));
  const [foreignTaxId, setForeignTaxId] = useState("");
  const [foreignTaxIdType, setForeignTaxIdType] = useState("outro");
  const [foreignTaxIdEdited, setForeignTaxIdEdited] = useState(false);

  useEffect(() => {
    if (!open) return;
    const slots = readForeignBankSlots(foreignSource?.foreign_bank_accounts);
    setForeignBanks([1, 2, 3].map(slot => slots.find(bank => bank.slot === slot) ?? { slot, account_type: "outro" }));
    setForeignTaxId(foreignSource?.tax_id_foreign ?? "");
    setForeignTaxIdType(foreignSource?.tax_id_type ?? "outro");
    setForeignTaxIdEdited(false);
  }, [open, editingSupplier?.id, companyLocale.companyId, role, user?.id, foreignSource]);

  // O IbanWarning precisa do valor vivo a cada tecla.
  // O Radix desmonta o conteúdo ao fechar, mas este
  // componente fica montado — logo o estado sobrevivia e reaparecia na
  // abertura seguinte. Ressincronizar na ABERTURA (não no fecho) garante o
  // valor certo já no primeiro render visível.
  useEffect(() => {
    if (!open) return;
    const slots = readBrBankSlots(brSource?.foreign_bank_accounts);
    setBrBanks([1, 2, 3].map(slot => slots.find(bank => bank.slot === slot) ?? {}));
    setIban1(editingSupplier?.iban ?? "");
    setIban2(editingSupplier?.iban_2 ?? "");
    setIban3(editingSupplier?.iban_3 ?? "");
  }, [open, editingSupplier, isBR ? brData : undefined, companyLocale.companyId, isBR, role, user?.id]);

  useEffect(() => {
    if (!open) return;
    setBrTaxId(formatBrTaxId(brSource?.tax_id_foreign ?? "", brSource?.tax_id_type));
    setBrTaxIdType(brSource?.tax_id_type ?? "cnpj");
    setBrTaxIdEdited(false);
  }, [open, editingSupplier?.id, companyLocale.companyId, isBR, role, user?.id,
    brColumnsReady, brSource?.tax_id_foreign, brSource?.tax_id_type]);

  const createMutation = useMutation({
    mutationFn: async (supplier: Record<string, any>) => {
      const { data, error } = await supabase.from("suppliers").insert(supplier as any).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      // Refetch supplier lists BEFORE firing onCreated so the new id already
      // exists in any parent Combobox options (evita "campo vazio" no modal
      // de transação — o supplier_id ficava setado mas visualmente ausente).
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["suppliers"] }),
        queryClient.refetchQueries({ queryKey: ["suppliers-active"] }),
      ]);
      onOpenChange(false);
      toast.success("Fornecedor criado com sucesso");
      onCreated?.(data.id);
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? "");
      const code = String(err?.code ?? "");
      if (msg.includes("suppliers_company_name_unique") || msg.includes("suppliers_name_unique")) {
        toast.error("Já existe um fornecedor/parceiro com este nome nesta empresa");
      } else if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
        toast.error("Sem permissão para criar fornecedores", {
          description: "A tua role não tem permissão. Pede a um admin/manager.",
        });
      } else if (code === "P0001" && /company_id/i.test(msg)) {
        toast.error("Empresa ativa não definida", {
          description: "Seleciona a empresa no canto superior antes de criar o fornecedor.",
        });
      } else if (code === "23503") {
        toast.error("Referência inválida", { description: msg });
      } else {
        toast.error("Erro ao criar fornecedor", { description: msg || code || "Erro desconhecido" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (supplier: Record<string, any>) => {
      // Track IBAN/SWIFT changes for audit
      const bankFields = ["foreign_bank_accounts", "iban", "swift_bic", "iban_2", "swift_bic_2", "iban_3", "swift_bic_3"];
      const changedBankFields: Record<string, { old: any; new: any }> = {};
      for (const field of bankFields) {
        const oldVal = editingSupplier?.[field] ?? null;
        if (!(field in supplier)) continue;
        const newVal = supplier[field] ?? null;
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changedBankFields[field] = { old: oldVal, new: newVal };
        }
      }

      const { error } = await supabase
        .from("suppliers")
        .update(supplier as any)
        .eq("id", editingSupplier?.id);
      if (error) throw error;

      if (Object.keys(changedBankFields).length > 0) {
        await logAudit({
          entity_type: "supplier",
          entity_id: editingSupplier?.id,
          action: "update_bank_details",
          changed_by: getAuditUser(user),
          old_data: Object.fromEntries(Object.entries(changedBankFields).map(([k, v]) => [k, v.old])),
          new_data: Object.fromEntries(Object.entries(changedBankFields).map(([k, v]) => [k, v.new])),
          metadata: { supplier_name: editingSupplier?.name },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-country", companyLocale.companyId, editingSupplier?.id] });
      if (isForeign) queryClient.invalidateQueries({ queryKey: ["supplier-br-details", companyLocale.companyId, editingSupplier?.id] });
      onOpenChange(false);
      toast.success("Fornecedor atualizado com sucesso");
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? "");
      const code = String(err?.code ?? "");
      if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
        toast.error("Sem permissão para editar fornecedores", {
          description: "A tua role não tem permissão. Pede a um admin/manager.",
        });
      } else {
        toast.error("Erro ao atualizar fornecedor", { description: msg || code || "Erro desconhecido" });
      }
    },
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // IBAN que já pertence a um fornecedor DESATIVADO da mesma empresa.
  const [inactiveMatch, setInactiveMatch] = useState<
    { id: string; name: string; nif: string | null; label: string } | null
  >(null);
  
  const canManageSuppliers =
    role === "admin" || role === "platform_admin" || role === "manager";

  const [similar, setSimilar] = useState<{ raw: Record<string, any>; list: SimilarSupplier[] } | null>(null);

  useEffect(() => {
    if (!open) {
      setInactiveMatch(null);
      setSimilar(null);
    }
  }, [open]);

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      await reactivateSupplier(id);
      return id;
    },
    onSuccess: async (id) => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["suppliers"] }),
        queryClient.refetchQueries({ queryKey: ["suppliers-active"] }),
      ]);
      setInactiveMatch(null);
      onOpenChange(false);
      toast.success("Fornecedor reativado");
      onCreated?.(id);
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? "");
      const code = String(err?.code ?? "");
      if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
        toast.error("Sem permissão para reativar fornecedores", {
          description: "Pede a um admin/manager.",
        });
      } else {
        toast.error("Erro ao reativar fornecedor", { description: msg || code || "Erro desconhecido" });
      }
    },
  });

  // Normalização única em toda a app: normalizeIban de @/lib/iban (remove espaços, pontos, hífens, _ e /)
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!/^[A-Z]{2}$/.test(supplierCountry)) {
      setValidationErrors({ country: "Selecione um país com código ISO de duas letras" });
      toast.error("Corrija os erros de validação");
      return;
    }
    const raw: Record<string, any> = {
      name: fd.get("name") as string,
      country: supplierCountry,
      trade_name: (fd.get("trade_name") as string) || null,
      nif: (fd.get("nif") as string) || null,
      contact_name: (fd.get("contact_name") as string) || null,
      email: (fd.get("email") as string) || null,
      phone: (fd.get("phone") as string) || null,
      address: (fd.get("address") as string) || null,
      iban: bankAccountValueToStore(fd.get("iban") as string, normalizeIban),
      swift_bic: (fd.get("swift_bic") as string) || null,
      iban_2: bankAccountValueToStore(fd.get("iban_2") as string, normalizeIban),
      swift_bic_2: (fd.get("swift_bic_2") as string) || null,
      iban_3: bankAccountValueToStore(fd.get("iban_3") as string, normalizeIban),
      swift_bic_3: (fd.get("swift_bic_3") as string) || null,
      payment_terms: (fd.get("payment_terms") as string) || null,
      category: (fd.get("category") as string) || null,
      notes: (fd.get("notes") as string) || null,
      is_partner: fd.get("is_partner") === "on",
    };
    if (isBR) {
      // Hidden PT fields retain the existing payload, without being edited in BR.
      raw.nif = editingSupplier?.nif ?? null;
      for (const field of ["iban", "iban_2", "iban_3", "swift_bic", "swift_bic_2", "swift_bic_3"]) {
        raw[field] = editingSupplier?.[field] ?? null;
      }
      if (brColumnsReady) {
        // Strip fiscal formatting; letters remain invalid rather than silently clearing an ID.
        const taxId = brTaxId.trim().replace(/[.\-/\s]/g, "") || null;
        const loadedTaxId = (brSource?.tax_id_foreign ?? "").trim().replace(/[.\-/\s]/g, "") || null;
        if (brTaxIdEdited && (isEditing
          ? taxId !== loadedTaxId || brTaxIdType !== (brSource?.tax_id_type ?? "cnpj")
          : !!taxId)) {
          raw.tax_id_foreign = taxId;
          raw.tax_id_type = brTaxIdType;
        }
        const existing = Array.isArray(brSource?.foreign_bank_accounts) ? brSource.foreign_bank_accounts : [];
        const brSlots = brBanks.flatMap((bank, i) => {
          if (occupiedForeignSlots.has(i + 1)) return [];
          const details = { ...bank };
          for (const [key] of BR_BANK_FIELDS) {
            if (typeof details[key] === "string") details[key] = details[key]!.trim();
          }
          return Object.entries(details).some(([key, value]) => !["slot", "account_type"].includes(key) && !!value)
            ? [{ ...details, slot: i + 1, account_type: "br_banco_agencia_conta" }] : [];
        });
        // Preserve other account types and metadata; only the three BR slots are edited.
        raw.foreign_bank_accounts = [...existing.filter((bank: any) => !readBrBankSlots([bank]).length), ...brSlots];
      }
    } else if (foreignColumnsReady) {
      const existing = foreignSource?.foreign_bank_accounts ?? [];
      const slots = foreignBanks.flatMap((bank, i) => {
        const accountNumber = raw[(["iban", "iban_2", "iban_3"] as const)[i]];
        if (classifyBankAccountValue(accountNumber) !== "nao_iban") return [];
        const details: ForeignBankSlot = { slot: i + 1, account_type: bank.account_type, account_number: accountNumber };
        for (const [key] of FOREIGN_BANK_FIELDS) {
          const value = bank[key]?.trim();
          if (value) details[key] = value;
        }
        return [details];
      });
      raw.foreign_bank_accounts = [
        ...existing.filter((bank: any) => !["aba_us", "outro"].includes(bank?.account_type)), ...slots,
      ];
      const taxId = (["cpf", "cnpj"].includes(foreignTaxIdType)
        ? foreignTaxId.trim().replace(/[.\-/\s]/g, "") : foreignTaxId.trim()) || null;
      if (foreignTaxIdEdited && (isEditing
        ? taxId !== foreignSource?.tax_id_foreign || foreignTaxIdType !== (foreignSource?.tax_id_type ?? "outro")
        : !!taxId)) {
        raw.tax_id_foreign = taxId;
        raw.tax_id_type = foreignTaxIdType;
      }
    }
    const result = validateForm(supplierSchema, raw);
    if (result.success === false) {
      setValidationErrors(result.errors);
      toast.error("Corrija os erros de validação");
      return;
    }
    setValidationErrors({});
    setInactiveMatch(null);
    setSimilar(null);

    // Validação estrutural (checksum MOD-97) e duplicação cross-supplier
    const ibanFields: Array<{ key: "iban" | "iban_2" | "iban_3"; label: string; value: string | null }> = [
      { key: "iban", label: "IBAN 1", value: raw.iban },
      { key: "iban_2", label: "IBAN 2", value: raw.iban_2 },
      { key: "iban_3", label: "IBAN 3", value: raw.iban_3 },
    ];

    for (const f of isBR ? [] : ibanFields) {
      if (!f.value) continue;
      // MOD-97 só para valores com forma de IBAN; não-IBAN (ABA, BR, …) passa sem bloqueio
      if (blocksSubmit(classifyBankAccountValue(f.value))) {
        // Motivo concreto (comprimento/dígitos de controlo/país); se os dois motores
        // discordarem (ibanWarningMessage devolve null), fica o texto genérico
        const reason = ibanWarningMessage(validateIban(f.value));
        toast.error(`${f.label} inválido`, {
          description: reason ?? "Verifique o formato (ex.: PT50XXXXXXXXXXXXXXXXXXXXX) e os dígitos de controlo.",
        });
        return;
      }
      const { data, error } = await supabase.rpc("check_supplier_iban_duplicate" as any, {
        p_iban: f.value,
        p_supplier_id: editingSupplier?.id ?? null,
      });
      if (error) {
        toast.error("Erro ao validar IBAN", { description: error.message });
        return;
      }
      const res = data as
        | { exists?: boolean; is_active?: boolean; supplier_id?: string; supplier_name?: string; nif?: string | null }
        | null;
      if (res?.exists) {
        // Fornecedor INATIVO: não é beco sem saída — propõe-se reativar o registo
        // existente (os índices únicos de IBAN só valem para is_active = true).
        if (res.is_active === false) {
          setInactiveMatch({
            id: res.supplier_id!,
            name: res.supplier_name ?? "(sem nome)",
            nif: res.nif ?? null,
            label: f.label,
          });
          return;
        }
        toast.error(`${f.label} duplicado`, {
          description: `Este IBAN já está registado no fornecedor «${res.supplier_name}» (NIF: ${res.nif ?? "—"}). Não é permitido o mesmo IBAN em fornecedores diferentes.`,
        });
        return;
      }
    }

    if (isEditing) {
      updateMutation.mutate(raw);
      return;
    }

    // D-ERP199: NIF igual ou nome parecido → aviso antes de criar.
    const { data: sim, error: simErr } = await supabase.rpc("check_supplier_similar" as any, {
      p_name: raw.name,
      p_nif: raw.nif,
      p_supplier_id: null,
    });
    if (simErr) {
      toast.error("Erro ao procurar fornecedores parecidos", { description: simErr.message });
      return;
    }
    const list = (sim ?? []) as SimilarSupplier[];
    if (list.length > 0) {
      setSimilar({ raw, list });
      return;
    }
    createMutation.mutate(raw);
  };

  const pickExisting = async (c: SimilarSupplier) => {
    if (!c.is_active) {
      reactivateMutation.mutate(c.id);
      return;
    }
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["suppliers"] }),
      queryClient.refetchQueries({ queryKey: ["suppliers-active"] }),
    ]);
    setSimilar(null);
    onOpenChange(false);
    toast.success(`A usar «${c.name}»`);
    onCreated?.(c.id);
  };

  // IBAN escrito (o primeiro) e slot livre na ficha existente.
  const ibanAppendPlan = (c: SimilarSupplier, raw: Record<string, any>) => {
    const typed = [
      { iban: raw.iban, swift: raw.swift_bic },
      { iban: raw.iban_2, swift: raw.swift_bic_2 },
      { iban: raw.iban_3, swift: raw.swift_bic_3 },
    ].find((x) => x.iban);
    if (!typed) return null;
    const existing = [c.iban, c.iban_2, c.iban_3].map((v) => normalizeIban(v));
    if (existing.includes(normalizeIban(typed.iban))) return null;
    const idx = [c.iban, c.iban_2, c.iban_3].findIndex((v) => !v);
    if (idx < 0) return null;
    const slot = (["iban", "iban_2", "iban_3"] as const)[idx];
    const swiftSlot = (["swift_bic", "swift_bic_2", "swift_bic_3"] as const)[idx];
    return { slot, swiftSlot, iban: typed.iban as string, swift: (typed.swift as string | null) ?? null };
  };

  const appendIbanMutation = useMutation({
    mutationFn: async ({ c, plan }: { c: SimilarSupplier; plan: NonNullable<ReturnType<typeof ibanAppendPlan>> }) => {
      const patch: Record<string, any> = { [plan.slot]: plan.iban };
      if (plan.swift) patch[plan.swiftSlot] = plan.swift;
      const { error } = await supabase.from("suppliers").update(patch as any).eq("id", c.id);
      if (error) throw error;
      await logAudit({
        entity_type: "supplier",
        entity_id: c.id,
        action: "update_bank_details",
        changed_by: getAuditUser(user),
        old_data: Object.fromEntries(Object.keys(patch).map((k) => [k, null])),
        new_data: patch,
        metadata: { supplier_name: c.name, source: "similar_supplier_append_iban" },
      });
      return c;
    },
    onSuccess: async (c) => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["suppliers"] }),
        queryClient.refetchQueries({ queryKey: ["suppliers-active"] }),
      ]);
      setSimilar(null);
      onOpenChange(false);
      toast.success(`IBAN acrescentado a «${c.name}»`);
      onCreated?.(c.id);
    },
    onError: (err: any) => toast.error("Erro ao acrescentar IBAN", { description: String(err?.message ?? err) }),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const s = editingSupplier;
  const renderForeignBankFields = (index: number) => foreignSlots[index] && <>
    <Label htmlFor={`sup-foreign-${index}-type`}>Tipo de conta</Label>
    <select id={`sup-foreign-${index}-type`} disabled={!foreignColumnsReady} value={foreignBanks[index].account_type}
      onChange={e => setForeignBanks(previous => previous.map((bank, i) => i === index
        ? { ...bank, account_type: e.target.value as ForeignBankSlot["account_type"] } : bank))}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
      <option value="aba_us">Conta EUA (ABA/Routing)</option>
      <option value="outro">Outra conta fora da zona IBAN</option>
    </select>
    <ForeignBankFields prefix={`sup-foreign-${index}`} value={foreignBanks[index]} disabled={!foreignColumnsReady}
      onChange={value => setForeignBanks(previous => previous.map((bank, i) => i === index ? value : bank))} />
  </>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName={overlayClassName} className={cn("max-h-[90vh] overflow-y-auto sm:max-w-lg", contentClassName)}>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Fornecedor / Parceiro" : "Novo Fornecedor / Parceiro"}</DialogTitle>
        </DialogHeader>
        <form onKeyDown={blockImplicitSubmitOnEnter} onSubmit={handleSubmit} autoComplete="off" className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sup-name">Nome da Entidade *</Label>
              <Input id="sup-name" name="name" required defaultValue={s?.name ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-trade-name">Nome Fantasia</Label>
              <Input id="sup-trade-name" name="trade_name" defaultValue={s?.trade_name ?? ""} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sup-country">País</Label>
            <select id="sup-country" name="country" required value={supplierCountry}
              onChange={e => setCountryDraft({ scope: countryScope, value: e.target.value })}
              aria-invalid={!!validationErrors.country}
              aria-describedby={validationErrors.country ? "sup-country-error" : undefined}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">Selecionar</option>
              {supplierCountry && !COUNTRIES[supplierCountry] && <option value={supplierCountry}>{supplierCountry}</option>}
              {Object.entries(COUNTRIES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            {validationErrors.country && <p id="sup-country-error" className="text-xs text-destructive">{validationErrors.country}</p>}
            {isEditing && countryFetched && savedCountry === null && <p className="text-xs text-muted-foreground">
              Não foi possível ler o país do fornecedor. Foi usado o país da empresa; confirme antes de guardar.
            </p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {(!isBR || isForeign) && <div className="grid gap-2">
              <Label htmlFor="sup-nif">{isBR ? companyLocale.labels.taxId : "NIF"}</Label>
              {isBR ? <>
                <Input id="sup-nif" disabled={!brColumnsReady} value={brColumnsReady ? brTaxId : ""}
                  onChange={e => { setBrTaxId(e.target.value); setBrTaxIdEdited(true); }}
                  onBlur={() => setBrTaxId(formatBrTaxId(brTaxId, brTaxIdType))}
                  aria-invalid={!!validationErrors.tax_id_foreign}
                  aria-describedby={validationErrors.tax_id_foreign ? "sup-tax-id-error" : undefined} />
                {validationErrors.tax_id_foreign && <p id="sup-tax-id-error" className="text-xs text-destructive">{validationErrors.tax_id_foreign}</p>}
                <Label htmlFor="sup-tax-id-type">Tipo de identificador fiscal</Label>
                <select id="sup-tax-id-type" disabled={!brColumnsReady} value={brColumnsReady ? brTaxIdType : "cnpj"}
                  onChange={e => { setBrTaxIdType(e.target.value); setBrTaxIdEdited(true); }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="cnpj">CNPJ</option><option value="cpf">CPF</option>
                  {brColumnsReady && !["cpf", "cnpj"].includes(brTaxIdType) && <option value={brTaxIdType}>{brTaxIdType.toUpperCase()}</option>}
                </select>
              </> : <Input id="sup-nif" name="nif" defaultValue={s?.nif ?? ""} />}
              {isForeign && !isBR && <>
                <Label htmlFor="sup-foreign-tax-id">Identificador fiscal estrangeiro</Label>
                <Input id="sup-foreign-tax-id" disabled={!foreignColumnsReady} value={foreignTaxId}
                  onChange={e => { setForeignTaxId(e.target.value); setForeignTaxIdEdited(true); }}
                  aria-invalid={!!validationErrors.tax_id_foreign}
                  aria-describedby={validationErrors.tax_id_foreign ? "sup-foreign-tax-id-error" : undefined} />
                {validationErrors.tax_id_foreign && <p id="sup-foreign-tax-id-error" className="text-xs text-destructive">{validationErrors.tax_id_foreign}</p>}
                <Label htmlFor="sup-foreign-tax-id-type">Tipo de identificador fiscal</Label>
                <select id="sup-foreign-tax-id-type" disabled={!foreignColumnsReady} value={foreignTaxIdType}
                  onChange={e => { setForeignTaxIdType(e.target.value); setForeignTaxIdEdited(true); }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {["ein", "tin", "vat", "cpf", "cnpj", "outro"].map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}
                </select>
              </>}
            </div>}
            {!defaultIsPartner && (
              <div className="grid gap-2">
                <Label htmlFor="sup-category">Categoria</Label>
                <Select name="category" defaultValue={s?.category ?? undefined}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {supplierCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sup-contact">Pessoa de contacto</Label>
              <Input id="sup-contact" name="contact_name" defaultValue={s?.contact_name ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-email">Email</Label>
              <Input id="sup-email" name="email" type="email" defaultValue={s?.email ?? ""} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sup-phone">Telefone</Label>
              <Input id="sup-phone" name="phone" defaultValue={s?.phone ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-payment">Condições pgto</Label>
              <Input id="sup-payment" name="payment_terms" placeholder="ex: 30 dias" defaultValue={s?.payment_terms ?? ""} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sup-address">{companyLocale.status === "available" ? companyLocale.labels.address : "Morada"}</Label>
            <Input id="sup-address" name="address" defaultValue={s?.address ?? ""} />
          </div>
          {isBR ? isForeign && <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Dados Bancários (até 3 contas)</p>
            {!brColumnsReady && <p className="text-xs text-muted-foreground">Dados bancários indisponíveis para edição.</p>}
            {brBanks.map((bank, i) => <div key={i} className="space-y-2">
              <p className="text-xs font-medium">Conta bancária {i + 1}</p>
              {occupiedForeignSlots.has(i + 1) && <p className="text-xs text-muted-foreground">Esta conta usa outro formato bancário.</p>}
              <BrBankFields prefix={`sup-br-${i}`} value={bank} disabled={!brColumnsReady || occupiedForeignSlots.has(i + 1)}
                onChange={value => setBrBanks(previous => previous.map((item, index) => index === i ? value : item))} />
            </div>)}
          </div> : <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Dados Bancários (até 3 IBANs)</p>
            {isForeign && !foreignColumnsReady && <p className="text-xs text-muted-foreground">Dados bancários estrangeiros indisponíveis para edição.</p>}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sup-iban">IBAN 1</Label>
                <Input id="sup-iban" name="iban" autoComplete="off" value={iban1} onChange={(e) => setIban1(e.target.value)} />
                <IbanWarning value={iban1} allowNonIban />
                {renderForeignBankFields(0)}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sup-swift">SWIFT/BIC 1</Label>
                <Input id="sup-swift" name="swift_bic" placeholder="ex: CGDIPTPL" defaultValue={s?.swift_bic ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sup-iban-2">IBAN 2</Label>
                <Input id="sup-iban-2" name="iban_2" autoComplete="off" value={iban2} onChange={(e) => setIban2(e.target.value)} />
                <IbanWarning value={iban2} allowNonIban />
                {renderForeignBankFields(1)}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sup-swift-2">SWIFT/BIC 2</Label>
                <Input id="sup-swift-2" name="swift_bic_2" placeholder="ex: CGDIPTPL" defaultValue={s?.swift_bic_2 ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sup-iban-3">IBAN 3</Label>
                <Input id="sup-iban-3" name="iban_3" autoComplete="off" value={iban3} onChange={(e) => setIban3(e.target.value)} />
                <IbanWarning value={iban3} allowNonIban />
                {renderForeignBankFields(2)}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sup-swift-3">SWIFT/BIC 3</Label>
                <Input id="sup-swift-3" name="swift_bic_3" placeholder="ex: CGDIPTPL" defaultValue={s?.swift_bic_3 ?? ""} />
              </div>
            </div>
          </div>}
          <div className="grid gap-2">
            <Label htmlFor="sup-notes">Notas</Label>
            <Textarea id="sup-notes" name="notes" rows={2} defaultValue={s?.notes ?? ""} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="sup-is-partner" name="is_partner" defaultChecked={s?.is_partner ?? defaultIsPartner ?? false} className="h-4 w-4 rounded border-border" />
            <Label htmlFor="sup-is-partner" className="cursor-pointer">Parceiro / Sócio (não aparece nos relatórios de fornecedores)</Label>
          </div>
          {/* (g9c · P2-12) Ligação ao utilizador do Portal — só na edição (precisa do id). */}
          {isEditing && s?.id && <SupplierPortalUserLink supplierId={s.id} />}
          {inactiveMatch && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm space-y-2">
              <p className="font-medium">
                {inactiveMatch.label}: já existe um fornecedor desativado com este IBAN
              </p>
              <p className="text-muted-foreground">
                «{inactiveMatch.name}» (NIF: {inactiveMatch.nif ?? "—"}) está desativado, por isso não
                aparece nas listas. Não é permitido um segundo registo ativo com o mesmo IBAN.
              </p>
              {canManageSuppliers ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={reactivateMutation.isPending}
                    onClick={() => reactivateMutation.mutate(inactiveMatch.id)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {reactivateMutation.isPending ? "A reativar…" : `Reativar «${inactiveMatch.name}»`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInactiveMatch(null)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
                  >
                    Alterar o IBAN
                  </button>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Pede a um admin/manager para reativar o fornecedor «{inactiveMatch.name}».
                </p>
              )}
            </div>
          )}
          {similar && (
            <SimilarSuppliersNotice
              list={similar.list}
              typedNif={similar.raw.nif}
              canManage={canManageSuppliers}
              busy={reactivateMutation.isPending || appendIbanMutation.isPending || createMutation.isPending}
              onUse={pickExisting}
              canAppendIban={(c) => canManageSuppliers && !!ibanAppendPlan(c, similar.raw)}
              onAppendIban={(c) => {
                const plan = ibanAppendPlan(c, similar.raw);
                if (plan) appendIbanMutation.mutate({ c, plan });
              }}
              onCreateAnyway={() => { const r = similar.raw; setSimilar(null); createMutation.mutate(r); }}
            />
          )}
          <button type="submit" disabled={isPending}
            className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {isPending ? "A guardar…" : isEditing ? "Guardar Alterações" : "Criar Fornecedor"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
