export function FaradayLogo({ size = 'md' }) {
  const width = size === 'lg' ? 160 : size === 'sm' ? 100 : 130
  return <img src="/FaradayDynamicsLogo.png" width={width} alt="Faraday Dynamics" style={{ display: 'block', margin: '0 auto' }} />
}