<INSTRUCTIONS>
## Oxc tooling
- Use Oxlint for linting and Oxfmt for formatting across the project.
- Do not change formatting by hand when Oxfmt would handle it.
- Run Oxlint/Oxfmt after edits that touch TypeScript/JavaScript, JSON, or config files.

## Current Oxlint config (.oxlintrc.json)

- Schema: ./node_modules/oxlint/configuration_schema.json
- Categories enabled: correctness (warn), suspicious (warn)
- Environments: browser, es2021, node
- Ignored paths: node_modules, dist, build, .git

## Current Oxfmt config (.oxfmtrc.jsonc)

- Schema: ./node_modules/oxfmt/configuration_schema.json
- printWidth: 100
- useTabs: true
- tabWidth: 1
- singleQuote: true
- semi: false
- Ignored paths: node_modules, dist, build, .git

## Expected usage

- Prefer `oxlint --fix .` for lint fixes.
- Format with `oxfmt` (use `oxfmt --check` in CI).
- Let Oxfmt handle formatting and import sorting.
  </INSTRUCTIONS>
