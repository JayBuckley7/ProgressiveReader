#!/usr/bin/env bash
set -euo pipefail

COVERAGE_MIN=${COVERAGE_MIN:-0}

coverage run -m unittest discover -s tests
coverage report --fail-under=${COVERAGE_MIN}
