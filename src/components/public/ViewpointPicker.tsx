import { useEffect, useRef } from 'react';
import Feature from 'ol/Feature';
import Map from 'ol/Map';
import View from 'ol/View';
import Point from 'ol/geom/Point';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat, toLonLat } from 'ol/proj';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import { Circle, Fill, Stroke, Style } from 'ol/style';
import 'ol/ol.css';

export interface ViewpointValue {
  readonly longitude: number | null;
  readonly latitude: number | null;
}

const markerStyle = new Style({
  image: new Circle({
    radius: 8,
    fill: new Fill({ color: '#ef6f42' }),
    stroke: new Stroke({ color: '#ffffff', width: 3 }),
  }),
});

export function ViewpointPicker({ value, onChange }: {
  readonly value: ViewpointValue;
  readonly onChange: (value: { readonly longitude: number; readonly latitude: number }) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef(new Feature<Point>());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    markerRef.current.setStyle(markerStyle);
    const source = new VectorSource({ features: [markerRef.current] });
    const map = new Map({
      target: host,
      layers: [
        new TileLayer({ source: new OSM({ crossOrigin: 'anonymous' }) }),
        new VectorLayer({ source }),
      ],
      view: new View({ center: fromLonLat([2.2, 46.5]), zoom: 5.5 }),
      controls: [],
    });
    const click = (event: { readonly coordinate: readonly number[] }) => {
      const [longitude, latitude] = toLonLat([...event.coordinate]);
      onChangeRef.current({ longitude, latitude });
    };
    map.on('click', click);
    return () => {
      map.un('click', click);
      map.setTarget(undefined);
    };
  }, []);

  useEffect(() => {
    if (value.longitude === null || value.latitude === null) {
      markerRef.current.setGeometry(undefined);
      return;
    }
    markerRef.current.setGeometry(new Point(fromLonLat([value.longitude, value.latitude])));
  }, [value.latitude, value.longitude]);

  const useDevicePosition = () => {
    navigator.geolocation?.getCurrentPosition((position) => {
      onChange({ longitude: position.coords.longitude, latitude: position.coords.latitude });
    });
  };

  return (
    <section className="fv-viewpoint-picker" aria-labelledby="fv-viewpoint-title">
      <header>
        <div>
          <h2 id="fv-viewpoint-title">Point de prise de vue</h2>
          <p>Placez l’endroit où se trouvait l’appareil. Ce point n’est jamais interprété comme la position du feu.</p>
        </div>
        <button type="button" className="fw-button fw-button--outline" onClick={useDevicePosition}>Utiliser ma position</button>
      </header>
      <div ref={hostRef} className="fv-viewpoint-picker__map" role="application" aria-label="Carte de placement du point de prise de vue" />
      <div className="fw-form-grid">
        <label>Longitude<input type="number" min="-180" max="180" step="0.000001" value={value.longitude ?? ''} onChange={(event) => onChange({ longitude: Number(event.target.value), latitude: value.latitude ?? 46.5 })} required /></label>
        <label>Latitude<input type="number" min="-90" max="90" step="0.000001" value={value.latitude ?? ''} onChange={(event) => onChange({ longitude: value.longitude ?? 2.2, latitude: Number(event.target.value) })} required /></label>
      </div>
      <p className="fv-viewpoint-picker__privacy"><strong>Privé par défaut.</strong> Les coordonnées exactes servent à l’analyse et ne sont jamais incluses dans la vue publique.</p>
    </section>
  );
}
