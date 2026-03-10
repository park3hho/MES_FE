export function StepIndicator({ steps, currentStep, selections, autoValues = {} }) {
  return (
    <div style={styles.container}>
      {steps.map((s, i) => (
        <div key={s.key} style={styles.item}>
          <span
            style={{
              ...styles.label,
              background: i === currentStep ? '#1a2f6e' : i < currentStep ? '#d0d5e8' : '#f0f1f5',
              color: i === currentStep ? '#ffffff' : i < currentStep ? '#6b7585' : '#adb4c2',
              fontWeight: i === currentStep ? 700 : 500,
            }}
          >
            {autoValues[s.key] ?? selections[s.key] ?? s.label}
          </span>
          {i < steps.length - 1 && <span style={styles.separator}>–</span>}
        </div>
      ))}
    </div>
  )
}

const styles = {
  container: {
    display: 'flex', alignItems: 'center', gap: 6,
    flexWrap: 'wrap', justifyContent: 'center', marginBottom: 32,
  },
  item: {
    display: 'flex', alignItems: 'center', gap: 6,
  },
  label: {
    fontSize: 10, padding: '4px 12px', borderRadius: 999,
    letterSpacing: '0.03em', transition: 'all 0.2s',
    height: 40, width: 64, textAlign: 'center',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  separator: {
    color: '#adb4c2', fontSize: 12,
  },
}
