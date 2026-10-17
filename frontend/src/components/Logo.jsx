import logoMark from '../assets/brand/logo-mark.svg'

/**
 * Brand lockup. To use the real logo: replace
 *   src/assets/brand/logo-mark.svg   (the square mark)
 *   public/favicon.svg               (browser tab icon)
 * and, if the logo already contains the wordmark, pass `wordmark={false}`.
 */
export default function Logo({ size = 34, wordmark = true, tagline = false }) {
  return (
    <span className="logo">
      <img src={logoMark} width={size} height={size} alt={wordmark ? '' : 'ERNIE'} />
      {wordmark && (
        <span>
          <span className="logo-word" style={{ fontSize: Math.max(16, size * 0.56), display: 'block' }}>ERNIE</span>
          {tagline && <span className="logo-tag" style={{ display: 'block' }}>Retention Intelligence</span>}
        </span>
      )}
    </span>
  )
}
