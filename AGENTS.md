# Agent Instructions

The following guidelines apply to all code contributions in this repository.

- Ensure new Python functions and modules include clear docstrings.
- Remove obsolete or commented-out code rather than leaving it in place.
- Use 4 spaces for indentation and keep line length under 100 characters.
- After any code change, run the Python tests with:
  ```bash
  python -m unittest discover -s tests
  ```
  Report the results in the pull request description.
- If JavaScript tests are added in the future, run `npm test` as well.

- Add TODO comments referencing the README for any features described there but missing in the codebase.
