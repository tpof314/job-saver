# Job Saver — Chrome extension
# There is no compile step: Chrome loads the files in this folder directly.
# These targets check, package and explain installation.

NAME     := job-saver-extension
VERSION  := $(shell python3 -c "import json;print(json.load(open('manifest.json'))['version'])" 2>/dev/null || echo dev)
DIST     := dist
ZIP      := $(DIST)/$(NAME)-$(VERSION).zip
SOURCES  := manifest.json background.js content.js extractors.js popup.html popup.js \
            lib/readability.js lib/READABILITY-LICENSE.md
JS       := background.js content.js extractors.js popup.js lib/readability.js

.DEFAULT_GOAL := help
.PHONY: help check package install clean

help: ## Show this list
	@echo "Job Saver $(VERSION)"
	@echo
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-9s %s\n", $$1, $$2}'

check: ## Check manifest.json and JavaScript for syntax errors
	@python3 -c "import json;json.load(open('manifest.json'))" && echo "manifest.json  OK"
	@if command -v node >/dev/null 2>&1; then \
	  for f in $(JS); do node --check $$f && echo "$$f  OK" || exit 1; done; \
	else echo "(node not found: skipping JavaScript syntax check)"; fi

package: check ## Build dist/job-saver-extension-<version>.zip
	@mkdir -p $(DIST)
	@rm -f $(ZIP)
	@zip -q -X $(ZIP) $(SOURCES)
	@echo "Built $(ZIP)"

install: ## Print the steps to load the extension into Chrome
	@echo "Chrome doesn't allow installing extensions from the command line."
	@echo "Load it by hand (one time only):"
	@echo
	@echo "  1. Open chrome://extensions in Chrome"
	@echo "  2. Turn on 'Developer mode' (top-right switch)"
	@echo "  3. Click 'Load unpacked' and choose this folder:"
	@echo "       $(CURDIR)"
	@echo "  4. Pin 'Job Saver' from the puzzle-piece menu in the toolbar"
	@echo
	@echo "After editing any file, click the reload arrow on the Job Saver card."

clean: ## Remove the dist folder
	@rm -rf $(DIST)
	@echo "Removed $(DIST)/"
