import './ParameterPanel.css'

function DimensionSlider({ label, unit, value, min, max, step, onChange }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="slider-group">
      <div className="slider-header">
        <label>{label}</label>
        <span className="slider-value">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step || 1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ '--pct': `${pct}%` }}
      />
      <div className="slider-range">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  )
}

function DirectionSlider({ leftLabel, rightLabel, value, onChange }) {
  const pct = ((value + 1) / 2) * 100
  return (
    <div className="direction-slider">
      <div className="direction-labels">
        <span className={`dir-label ${value < -0.1 ? 'active' : ''}`}>{leftLabel}</span>
        <span className="dir-center">0</span>
        <span className={`dir-label ${value > 0.1 ? 'active' : ''}`}>{rightLabel}</span>
      </div>
      <input
        type="range" min={-100} max={100} step={1}
        value={Math.round(value * 100)}
        onChange={e => onChange(Number(e.target.value) / 100)}
        className="direction-input"
        style={{ '--pct': `${pct}%` }}
      />
    </div>
  )
}

export default function ParameterPanel({ sliders, dimensions, onSliderChange, onDimensionChange }) {
  return (
    <div className="parameter-panel">
      <h2>Dimensions</h2>

      <DimensionSlider
        label="Hip Point Height" unit="mm"
        value={dimensions.hipPointHeight} min={350} max={550}
        onChange={v => onDimensionChange('hipPointHeight', v)}
      />
      <DimensionSlider
        label="Backrest Height" unit="mm"
        value={dimensions.backrestHeight} min={300} max={800}
        onChange={v => onDimensionChange('backrestHeight', v)}
      />
      <DimensionSlider
        label="Seat Width" unit="mm"
        value={dimensions.seatWidth} min={350} max={600}
        onChange={v => onDimensionChange('seatWidth', v)}
      />
      <DimensionSlider
        label="Seat Depth" unit="mm"
        value={dimensions.seatDepth} min={350} max={550}
        onChange={v => onDimensionChange('seatDepth', v)}
      />

      <h2>Design Direction</h2>

      <DirectionSlider
        leftLabel="Organic"
        rightLabel="Geometric"
        value={sliders.organicGeo}
        onChange={v => onSliderChange('organicGeo', v)}
      />
      <DirectionSlider
        leftLabel="Simple"
        rightLabel="Complex"
        value={sliders.simpleComplex}
        onChange={v => onSliderChange('simpleComplex', v)}
      />
      <DirectionSlider
        leftLabel="Abstract"
        rightLabel="Structural"
        value={sliders.abstractStructural}
        onChange={v => onSliderChange('abstractStructural', v)}
      />
    </div>
  )
}
