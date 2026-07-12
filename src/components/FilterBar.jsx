import { todayLocal } from '../lib/utils'

function FilterBar({ date, onDateChange, onStep, resultCount, rangeStartDate, rangeEndDate, onRangeChange, onClearRange }) {
  const isToday = date === todayLocal()
  const isInRangeMode = rangeStartDate && rangeEndDate

  return (
    <div className="controlbar">
      <div className="datenav">
        <button
          type="button"
          className="datenav-btn"
          onClick={() => onStep(-1)}
          aria-label="Previous"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>

        {isInRangeMode ? (
          <>
            <input
              type="date"
              className="datenav-input"
              aria-label="Start date"
              value={rangeStartDate}
              onChange={e => onRangeChange(e.target.value, rangeEndDate)}
              max={rangeEndDate}
              style={{
                padding: '6px 12px',
                backgroundColor: '#1a2a3a',
                border: '2px solid #4a7acc',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            />
            <span style={{padding: '0 12px', color: '#aaa', fontWeight: 500}}>to</span>
            <input
              type="date"
              className="datenav-input"
              aria-label="End date"
              value={rangeEndDate}
              onChange={e => onRangeChange(rangeStartDate, e.target.value)}
              min={rangeStartDate}
              style={{
                padding: '6px 12px',
                backgroundColor: '#1a2a3a',
                border: '2px solid #4a7acc',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            />
            <button type="button" className="datenav-today" onClick={onClearRange}>
              Clear Range
            </button>
          </>
        ) : (
          <>
            <input
              type="date"
              className="datenav-input"
              aria-label="Selected date"
              value={date}
              onChange={e => onDateChange(e.target.value)}
            />
            <button
              type="button"
              className="datenav-btn"
              onClick={() => onStep(1)}
              aria-label="Next"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="m10 6 6 6-6 6" />
              </svg>
            </button>
            {!isToday && (
              <button type="button" className="datenav-today" onClick={() => onDateChange(todayLocal())}>
                Today
              </button>
            )}
            <button type="button" className="datenav-today" onClick={() => onRangeChange(todayLocal(), todayLocal())} title="Select date range">
              📅 Range
            </button>
          </>
        )}
      </div>

      <div className="fb-spacer" />

      <span className="fb-count">{resultCount} report{resultCount !== 1 ? 's' : ''}</span>
    </div>
  )
}

export default FilterBar
