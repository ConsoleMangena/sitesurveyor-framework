let quoteCreateRequested = false;

/** Set by dashboard action buttons before navigating to the quotes view. */
export function requestQuoteCreate(): void {
  quoteCreateRequested = true;
}

/** Read (and clear) a pending request to open the quote create form. */
export function consumeQuoteCreateRequest(): boolean {
  const pending = quoteCreateRequested;
  quoteCreateRequested = false;
  return pending;
}