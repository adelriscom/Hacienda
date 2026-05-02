export default function Icon({ name, size = 16, className, style }) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    className, style,
  }
  switch (name) {
    case 'grid':        return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
    case 'expense':     return <svg {...props}><path d="M7 17L17 7M17 7H9M17 7v8"/></svg>
    case 'income':      return <svg {...props}><path d="M17 7L7 17M7 17h8M7 17V9"/></svg>
    case 'budget':      return <svg {...props}><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="9"/></svg>
    case 'report':      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 3"/></svg>
    case 'recurring':   return <svg {...props}><path d="M21 12a9 9 0 1 1-3.5-7.1M21 4v5h-5"/></svg>
    case 'account':     return <svg {...props}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg>
    case 'calendar':    return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
    case 'review':      return <svg {...props}><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
    case 'doc':         return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
    case 'search':      return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
    case 'bell':        return <svg {...props}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
    case 'plus':        return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>
    case 'cog':         return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
    case 'trend-up':    return <svg {...props}><path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/></svg>
    case 'trend-down':  return <svg {...props}><path d="M22 17 13.5 8.5 8.5 13.5 2 7"/><path d="M16 17h6v-6"/></svg>
    case 'card':        return <svg {...props}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
    case 'wallet':      return <svg {...props}><path d="M21 12V8a2 2 0 0 0-2-2H5a2 2 0 0 1 0-4h14v4"/><path d="M3 6v12a2 2 0 0 0 2 2h16v-4"/><circle cx="17" cy="14" r="1.5"/></svg>
    case 'btc':         return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M9 7v10M9 7h4.5a2.5 2.5 0 1 1 0 5H9M9 12h5a2.5 2.5 0 1 1 0 5H9M11 5v2M11 17v2M14 5v2M14 17v2"/></svg>
    case 'piggy':       return <svg {...props}><path d="M19 5c-1.5 0-2.8.4-4 1H8a6 6 0 0 0-5.6 4H1a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h2c.4.7 1 1.4 2 2v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1h4v1a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2.4c.5-.4 1-1 1.4-1.6L21 13a1 1 0 0 0 1-1V8a4 4 0 0 0-3-3"/><path d="M16 11h.01"/></svg>
    case 'filter':      return <svg {...props}><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></svg>
    case 'more':        return <svg {...props}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
    case 'check':       return <svg {...props}><path d="m20 6-11 11-5-5"/></svg>
    case 'x':           return <svg {...props}><path d="M18 6 6 18M6 6l12 12"/></svg>
    case 'ghost':       return <svg {...props}><path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 3 3 2-3 2 3 3-3 3 3V10a8 8 0 0 0-8-8z"/></svg>
    case 'users':       return <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    case 'link':        return <svg {...props}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
    case 'sparkle':     return <svg {...props}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>
    case 'chevron-right': return <svg {...props}><path d="m9 6 6 6-6 6"/></svg>
    case 'chevron-down':  return <svg {...props}><path d="m6 9 6 6 6-6"/></svg>
    case 'arrow-up-right':   return <svg {...props}><path d="M7 17 17 7M7 7h10v10"/></svg>
    case 'arrow-down-right': return <svg {...props}><path d="M7 7l10 10M17 7v10H7"/></svg>
    case 'lightbulb':   return <svg {...props}><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.8.6 1.3 1.5 1.3 2.5V18h5.4v-.8c0-1 .5-1.9 1.3-2.5A7 7 0 0 0 12 2"/></svg>
    case 'cash':        return <svg {...props}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v.01M18 14v.01"/></svg>
    case 'mail':        return <svg {...props}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
    case 'lock':        return <svg {...props}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    case 'upload':      return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    case 'edit':        return <svg {...props}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    case 'toggle-on':   return <svg {...props}><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="4" fill="currentColor" stroke="none"/></svg>
    case 'toggle-off':  return <svg {...props}><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="8" cy="12" r="4" fill="currentColor" stroke="none"/></svg>
    case 'logout':      return <svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
    default:            return <svg {...props}><circle cx="12" cy="12" r="9"/></svg>
  }
}
