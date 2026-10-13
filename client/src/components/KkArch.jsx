import { houseStyle } from '../styles/karrakin/frame.js';

// KARRAKIN: арка навколо портрета пілота (168×220) і навершя над нею — за домом
// (роги, корона, промені, вінок, ключ). Геометрія з прототипу handoff, кольори — змінні теми.
const CROWNS = {
  horns: (
    <>
      <circle cx="84" cy="84" r="90" fill="none" strokeOpacity=".22" className="kt" />
      <path d="M2 150C-18 110 -12 40 34 16C52 6 70 2 84 -14C78 -20 78 -28 84 -32C90 -28 90 -20 84 -14C98 2 116 6 134 16C180 40 186 110 166 150" fill="none" strokeWidth="1.1" className="kt" />
      <path d="M2 132C-8 100 -2 56 30 32M166 132C176 100 170 56 138 32" fill="none" strokeOpacity=".6" className="ka" />
      <rect x="81" y="-43" width="6" height="6" transform="rotate(45 84 -40)" className="ft" />
    </>
  ),
  crown: (
    <>
      <path d="M-4.9 60.2A92 92 0 0 1 172.9 60.2M0.9 36L-6.1 32M36 0.9L28 -13M84 -12L84 -38M132 0.9L140 -13M167.1 36L174.1 32" fill="none" strokeWidth="1.1" className="kt" />
      <path d="M-3 43.4A96 96 0 0 1 171 43.4" fill="none" strokeWidth=".6" strokeOpacity=".6" className="kt" />
      <path d="M-9.5 26.8L-7.1 30L-9.5 33.2L-11.9 30ZM26 -19.7L28.4 -16.5L26 -13.3L23.6 -16.5ZM84 -47L87.8 -42L84 -37L80.3 -42ZM142 -19.7L144.4 -16.5L142 -13.3L139.6 -16.5ZM177.5 26.8L179.9 30L177.5 33.2L175.1 30ZM-4.9 57.2L-2.7 60.2L-4.9 63.2L-7.2 60.2ZM172.9 57.2L175.2 60.2L172.9 63.2L170.7 60.2Z" className="fgl" />
      <path d="M2.1 26.6A100 100 0 0 1 165.9 26.6" fill="none" strokeOpacity=".5" className="ka" />
    </>
  ),
  rays: (
    <>
      <path d="M-4 84A88 88 0 0 1 172 84" fill="none" strokeWidth=".8" strokeOpacity=".6" className="kt" />
      <path d="M-5.5 74.6L-25.4 72.5M6.1 39L-11.3 29M31.1 11.2L19.3 -5M65.3 -4L61.1 -23.6M102.7 -4L106.9 -23.6M136.9 11.2L148.7 -5M161.9 39L179.3 29M173.5 74.6L193.4 72.5" fill="none" strokeWidth="1" className="kt" />
      <path d="M-1.6 56.2L-11.1 53.1M17.1 23.8L9.7 17.1M47.4 1.8L43.3 -7.4M84 -6L84 -16M120.6 1.8L124.7 -7.4M150.9 23.8L158.3 17.1M169.6 56.2L179.1 53.1" fill="none" strokeOpacity=".6" className="ka" />
      <path d="M84 -39L87.8 -34L84 -29L80.3 -34ZM84 -36.6L86 -34L84 -31.4L82 -34Z" className="fgl" />
    </>
  ),
  wreath: (
    <>
      <path d="M3.5 130.5A93 93 0 0 1 71.1 -8.1M164.5 130.5A93 93 0 0 0 96.9 -8.1" fill="none" strokeWidth="1.1" className="kt" />
      <path d="M0.6 125.2Q-2.5 119.4 -9.1 120Q-5.9 125.7 0.6 125.2ZM-6.3 106.2Q-8.1 100.1 -14.4 99.3Q-12.6 105.4 -6.3 106.2ZM-9 86.2Q-9.3 80.1 -15.2 78Q-14.8 84.2 -9 86.2ZM-7.3 66.1Q-6.3 60.3 -11.4 57.1Q-12.3 63 -7.3 66.1ZM-1.3 46.9Q0.9 41.5 -3.3 37.5Q-5.4 42.9 -1.3 46.9ZM8.7 29.4Q11.9 24.8 8.8 20.1Q5.7 24.7 8.7 29.4ZM22.3 14.5Q26.2 10.8 24.2 5.8Q20.3 9.4 22.3 14.5ZM38.7 2.8Q43.1 0.2 42.3 -4.9Q37.9 -2.3 38.7 2.8ZM57.3 -5.1Q62 -6.6 62.3 -11.6Q57.6 -10 57.3 -5.1ZM167.4 125.2Q173.9 125.7 177.1 120Q170.5 119.4 167.4 125.2ZM174.3 106.2Q180.6 105.4 182.4 99.3Q176.1 100.1 174.3 106.2ZM177 86.2Q182.8 84.2 183.2 78Q177.3 80.1 177 86.2ZM175.3 66.1Q180.3 63 179.4 57.1Q174.3 60.3 175.3 66.1ZM169.3 46.9Q173.4 42.9 171.3 37.5Q167.1 41.5 169.3 46.9ZM159.3 29.4Q162.3 24.7 159.2 20.1Q156.1 24.8 159.3 29.4ZM145.7 14.5Q147.7 9.4 143.8 5.8Q141.8 10.8 145.7 14.5ZM129.3 2.8Q130.1 -2.3 125.7 -4.9Q124.9 0.2 129.3 2.8ZM110.7 -5.1Q110.4 -10 105.7 -11.6Q106 -6.6 110.7 -5.1Z" strokeWidth=".8" className="leaf-t" />
      <path d="M0.6 125.2Q4.6 121.1 2.1 115.9Q-1.8 120 0.6 125.2ZM-6.3 106.2Q-1.7 103.2 -3 97.8Q-7.6 100.8 -6.3 106.2ZM-9 86.2Q-4 84.3 -4.1 79Q-9 80.9 -9 86.2ZM-7.3 66.1Q-2.2 65.4 -1.1 60.3Q-6.2 61.1 -7.3 66.1ZM-1.3 46.9Q3.7 47.3 5.7 42.7Q0.7 42.3 -1.3 46.9ZM8.7 29.4Q13.3 30.8 16.2 26.9Q11.6 25.5 8.7 29.4ZM22.3 14.5Q26.3 16.7 29.8 13.7Q25.7 11.4 22.3 14.5ZM38.7 2.8Q42 5.8 45.9 3.6Q42.6 0.6 38.7 2.8ZM57.3 -5.1Q59.7 -1.6 63.9 -2.8Q61.4 -6.3 57.3 -5.1ZM167.4 125.2Q169.8 120 165.9 115.9Q163.4 121.1 167.4 125.2ZM174.3 106.2Q175.6 100.8 171 97.8Q169.7 103.2 174.3 106.2ZM177 86.2Q177 80.9 172.1 79Q172 84.3 177 86.2ZM175.3 66.1Q174.2 61.1 169.1 60.3Q170.2 65.4 175.3 66.1ZM169.3 46.9Q167.3 42.3 162.3 42.7Q164.3 47.3 169.3 46.9ZM159.3 29.4Q156.4 25.5 151.8 26.9Q154.7 30.8 159.3 29.4ZM145.7 14.5Q142.3 11.4 138.2 13.7Q141.7 16.7 145.7 14.5ZM129.3 2.8Q125.4 0.6 122.1 3.6Q126 5.8 129.3 2.8ZM110.7 -5.1Q106.6 -6.3 104.1 -2.8Q108.3 -1.6 110.7 -5.1Z" strokeWidth=".7" strokeOpacity=".8" className="leaf-a" />
      <path d="M78 -12Q84 -4 90 -12M84 -9V-2" fill="none" strokeWidth=".9" className="kgl" />
      <path d="M84 -18L87 -14L84 -10L81 -14ZM3.5 133.9L5.5 136.5L3.5 139.1L1.5 136.5ZM164.5 133.9L166.4 136.5L164.5 139.1L162.6 136.5Z" className="fgl" />
    </>
  ),
  key: (
    <>
      <path d="M-14 84A98 98 0 0 1 182 84M-14 84V220M182 84V220M-14 220H182" fill="none" strokeWidth="1" className="kt" />
      <path d="M-13.7 48.4A104 104 0 0 1 181.7 48.4" fill="none" strokeWidth=".6" strokeOpacity=".5" className="kt" />
      <path d="M76 -18H92L96 -4H72Z" strokeWidth=".9" className="keystone" />
      <path d="M84 -14L86.3 -11L84 -8L81.8 -11ZM-14 80.5L-11.4 84L-14 87.5L-16.6 84ZM182 80.5L184.6 84L182 87.5L179.4 84ZM-14 149.4L-12.1 152L-14 154.6L-15.9 152ZM182 149.4L183.9 152L182 154.6L180.1 152Z" className="fgl" />
      <path d="M-8 84H2M166 84H176" fill="none" strokeOpacity=".7" className="ka" />
    </>
  ),
};

export default function KkArch({ house, children }) {
  const crown = CROWNS[houseStyle(house).crown];
  return (
    <div className="kk-arch">
      <svg className="kk-arch-bg" width="168" height="220" viewBox="0 0 168 220" aria-hidden="true">
        <path d="M2 220V84A82 82 0 0 1 166 84V220Z" />
      </svg>
      {children}
      <svg className="kk-arch-fg" width="168" height="220" viewBox="0 0 168 220" aria-hidden="true">
        <path d="M2 220V84A82 82 0 0 1 166 84V220Z" fill="none" strokeWidth="1.2" className="kt" />
        <path d="M12 212V86A72 72 0 0 1 156 86V212Z" fill="none" className="kt" />
        <path d="M16 212V86A68 68 0 0 1 152 86V212" fill="none" strokeWidth="3" strokeOpacity=".5" className="ka glow" />
        <path d="M16 212V86A68 68 0 0 1 152 86V212" fill="none" strokeWidth=".8" strokeOpacity=".75" className="kal" />
        <path d="M2 212C2 216 6 220 12 220H156C162 220 166 216 166 212" fill="none" className="kt" />
        {crown}
      </svg>
    </div>
  );
}
