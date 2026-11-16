TECTONIC ?= tectonic
LATEXMK  ?= latexmk
TARGET   := main

.PHONY: all clean

# Tectonic is preferred where it is installed because it needs no separate
# TeX Live tree; otherwise fall back to a normal latexmk build.
all:
	@if command -v $(TECTONIC) >/dev/null 2>&1; then \
		echo "building with $(TECTONIC)"; \
		$(TECTONIC) $(TARGET).tex; \
	else \
		echo "building with $(LATEXMK)"; \
		$(LATEXMK) -pdf $(TARGET).tex; \
	fi

clean:
	rm -f $(TARGET).aux $(TARGET).bbl $(TARGET).blg $(TARGET).log \
	      $(TARGET).out $(TARGET).toc $(TARGET).fls $(TARGET).fdb_latexmk \
	      $(TARGET).synctex.gz $(TARGET).pdf
