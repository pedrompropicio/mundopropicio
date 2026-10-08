import { useEffect, useState } from "react";

/**
 * Devolve o valor após `delay` ms sem mudanças. Usado nos campos que a pessoa
 * escreve a correr (descrição, ref de fatura, montante) para que a queryKey do
 * aviso de duplicados não mude a cada tecla.
 */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
