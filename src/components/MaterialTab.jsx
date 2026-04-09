import { MATERIAL_OPTIONS } from '../engine/chairGenerator'
import './MaterialTab.css'

const MATERIAL_KEYS = Object.keys(MATERIAL_OPTIONS)

function ColorDot({ color }) {
  return <span className="color-dot" style={{ background: color }} />
}

export default function MaterialTab({ selected, onChange }) {
  return (
    <div className="material-tab">
      <h2>Material</h2>
      <p className="material-desc">Choose a primary material. Affects colors, reflections, and texture.</p>

      <div className="material-list">
        <button
          className={`material-btn ${!selected ? 'active' : ''}`}
          onClick={() => onChange(null)}
        >
          <div className="material-info">
            <span className="material-label">Auto</span>
            <span className="material-sub">Based on design direction</span>
          </div>
        </button>

        {MATERIAL_KEYS.map(key => {
          const m = MATERIAL_OPTIONS[key]
          const isActive = selected === key
          return (
            <button
              key={key}
              className={`material-btn ${isActive ? 'active' : ''}`}
              onClick={() => onChange(key)}
            >
              <div className="material-swatches">
                <ColorDot color={m.theme.seat.color} />
                <ColorDot color={m.theme.leg.color} />
              </div>
              <div className="material-info">
                <span className="material-label">{m.label}</span>
                <span className="material-sub">{m.desc}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
