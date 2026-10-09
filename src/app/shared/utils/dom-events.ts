/** Valor de un input/textarea/select a partir de su evento (tipado, sin `any`). */
export function inputValue(event: Event): string {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  return target?.value ?? '';
}

export function inputChecked(event: Event): boolean {
  return (event.target as HTMLInputElement | null)?.checked ?? false;
}
