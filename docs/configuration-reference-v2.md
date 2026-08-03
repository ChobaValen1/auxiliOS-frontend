# Configuration reference v2

## Applied database migrations

- `configuration_reference_v2_schema`
- `configuration_reference_v2_rpcs`
- `configuration_reference_v2_engine_bridge`
- `configuration_reference_v2_quote_engine`

## Model

### Service types

`service_concepts` remains the global catalog. `service_category` is derived as:

- `primary`: can start a service.
- `secondary`: can only be added to another service.
- `mixed`: can be used alone or as an additional concept.

### Tariff types

`tariff_types` and `tariff_type_service_links` define how a service is billed.

Default types:

- `movement`: adds movement price and kilometers.
- `work`: fixed or quantity-based concept; does not add kilometers.
- `sale`: unit-based product sale; does not add kilometers.

### Provider configuration

`company_service_settings` controls which services each provider accepts and its external code strategy.

### Versioned prices

`company_service_price_versions` stores immutable revisions by:

- provider;
- billing base;
- service type;
- effective date.

Each revision supports explicit numeric values, `automatic`, or `not_applicable` for:

- service/movement day, night and weekend/holiday;
- asphalt kilometer day, night and weekend/holiday;
- dirt-road kilometer day, night and weekend/holiday;
- vehicle storage.

### Quote engine

The quote engine resolves `company_service_price_versions` first. Automatic values fall back to the published legacy rate card and its surcharge rules. Explicit night or weekend values are not charged a second time by percentage rules.

The existing published rate cards remain immutable and available as compatibility fallback.
