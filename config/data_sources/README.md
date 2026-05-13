# Custom Data Sources

This directory holds configuration files for plugging custom legal data sources into LawMind AI.

## Adding a New Data Source

1. Create a new `.yaml` or `.json` file in this directory. The filename is used as the source identifier.

2. Each configuration file must include the following fields:

```yaml
name: My Custom Law Database
type: api          # api | database | file
enabled: true

# Connection details (vary by type)
connection:
  base_url: https://api.example.com
  api_key: ${MY_API_KEY}        # resolved from environment variables
  timeout: 30

# Capabilities this source provides
capabilities:
  - legislation_search           # full-text law search
  - provision_lookup             # exact article retrieval
  - case_search                  # case law search
  - citation_validation          # citation verification

# Field mapping (how results from this source map to LawMind models)
field_map:
  title: doc_title
  content: full_text
  article_number: art_no
  document_id: doc_id
  promulgation_date: pub_date
  effective_date: eff_date
  status: validity
```

3. Environment variables referenced with `${...}` syntax are resolved at runtime.

4. Restart the LawMind AI backend to pick up the new data source.

## Supported Source Types

| Type     | Description                                        |
|----------|----------------------------------------------------|
| `api`    | REST API endpoint (requires `base_url`)            |
| `database` | Direct database connection (requires `dsn`)       |
| `file`   | Local or mounted file path (CSV, JSONL, XML)       |

## Examples

See the bundled sources in `backend/app/services/data_sources/` for reference implementations:

- `beida_fabao.py` -- BeiDa FaBao (chinese-law MCP)
- `custom_api.py` -- Generic REST API adapter
- `base.py` -- Abstract base class for all sources
