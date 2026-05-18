export function FarmMap() {
  return (
    <section className="agro-card overflow-hidden p-0">
      <div className="farm-map" aria-label="Map view for farm location">
        <div className="map-grid" />
        <div className="field field-north">North maize</div>
        <div className="field field-east">East beds</div>
        <div className="field field-orchard">Orchard</div>
        <div className="map-pin" aria-hidden="true" />
      </div>
    </section>
  );
}
