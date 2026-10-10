// Made-up numbers for previewing dashboard.html on a local server
// (http://localhost:8765/dashboard.html?preview). Never used on the live
// site: dashboard.js only loads this file on localhost.
window.DB_SAMPLE = function (days) {
  var daily = [];
  for (var i = days - 1; i >= 0; i--) {
    var d = new Date(Date.now() - i * 864e5);
    var v = Math.round(18 + 10 * Math.sin(i / 3) + (days - i) * 0.4 + (d.getDay() === 0 ? 14 : 0));
    daily.push({ date: d.toISOString().slice(0, 10), visitors: v, pageViews: Math.round(v * 2.6) });
  }
  var sum = daily.reduce(function (s, r) { return s + r.visitors; }, 0);
  return {
    generated: new Date().toISOString(), days: days, cached: false,
    ga: { status: 'ok', data: {
      daily: daily,
      totals: { visitors: sum, newVisitors: Math.round(sum * 0.7), visits: Math.round(sum * 1.3), pageViews: Math.round(sum * 2.6), avgVisitSeconds: 96, engagementRate: 0.58 },
      before: { visitors: Math.round(sum * 0.86), newVisitors: 0, visits: 0, pageViews: Math.round(sum * 2.3), avgVisitSeconds: 80, engagementRate: 0.5 },
      channels: [{ name: 'Organic Social', value: 210 }, { name: 'Direct', value: 160 }, { name: 'Organic Search', value: 74 }, { name: 'Referral', value: 18 }],
      sources: [{ name: 'facebook.com', value: 150 }, { name: '(direct)', value: 160 }, { name: 'google', value: 74 }, { name: 'instagram.com', value: 60 }, { name: 'l.facebook.com', value: 22 }],
      pages: [{ name: '/', value: 420, people: 300 }, { name: '/rec-sports.html', value: 260, people: 140 }, { name: '/store.html', value: 190, people: 120 }, { name: '/farms.html', value: 120, people: 90 }, { name: '/symphonymph.html', value: 88, people: 60 }, { name: '/social.html', value: 40, people: 30 }],
      events: [{ key: 'sign_up_click', label: 'Sign-up buttons (compost, recycling, league)', now: 34, before: 22 }, { key: 'supplier_click', label: 'Opened a supplier page (demo store)', now: 61, before: 40 }, { key: 'social_click', label: 'Clicked to Facebook, Instagram or YouTube', now: 45, before: 50 }, { key: 'wish_list', label: 'Saved to a wish list', now: 19, before: 8 }, { key: 'newsletter_signup', label: 'Joined the newsletter', now: 9, before: 5 }, { key: 'app_download', label: 'Downloaded Symphonymph', now: 7, before: 4 }, { key: 'donate_click', label: 'Opened the donate window', now: 3, before: 1 }],
      downloads: { daily: [{ date: '2026-10-08', value: 2 }, { date: '2026-10-09', value: 4 }, { date: '2026-10-10', value: 1 }], allTime: 23, since: '2026-10-02', byFile: [{ name: 'symphonymph-2.7.0.apk', value: 19 }, { name: 'symphonymph-tv-2.7.0.apk', value: 4 }], fileDimension: true },
      devices: [{ name: 'mobile', value: 330 }, { name: 'desktop', value: 120 }, { name: 'tablet', value: 12 }],
      cities: [{ name: 'Eufaula', value: 120 }, { name: 'McAlester', value: 96 }, { name: 'Checotah', value: 40 }, { name: 'Tulsa', value: 31 }, { name: 'Oklahoma City', value: 22 }],
      products: [{ event: 'supplier_click', name: 'swedish-dishcloths', value: 14 }, { event: 'sign_up_click', name: 'soccer-player-fall', value: 21 }, { event: 'sign_up_click', name: 'compost-monthly', value: 9 }, { event: 'wish_list', name: 'wool-dryer-balls', value: 6 }],
      searches: [{ name: 'soap', value: 12 }, { name: 'compost', value: 9 }, { name: 'seeds', value: 7 }, { name: 'dish brush', value: 4 }],
      customDimensions: true,
    } },
    gsc: { status: 'ok', data: { from: daily[0].date, to: daily[daily.length - 3].date, clicks: 74, impressions: 1830, position: 14.2,
      queries: [{ name: 'lavish leaf', clicks: 40, impressions: 120, position: 1.2 }, { name: 'eufaula adult soccer league', clicks: 12, impressions: 300, position: 6.4 }, { name: 'compost pickup oklahoma', clicks: 6, impressions: 410, position: 11.8 }, { name: 'symphonymph', clicks: 9, impressions: 40, position: 1.0 }],
      pages: [{ name: '/', clicks: 40, impressions: 500 }, { name: '/rec-sports.html', clicks: 18, impressions: 600 }, { name: '/farms.html', clicks: 8, impressions: 520 }] } },
    social: { status: 'ok', data: { errors: [],
      facebook: { followers: 412, posts: [{ text: 'Week 3 of the fall league is in the books!', date: new Date(Date.now() - 3 * 864e5).toISOString(), url: '#', image: 'images/soccer-team.jpg', likes: 48, comments: 9, shares: 4, total: 61 }, { text: 'Compost pick-up spots open in Eufaula.', date: new Date(Date.now() - 9 * 864e5).toISOString(), url: '#', image: 'images/compost-pickup.jpg', likes: 22, comments: 3, shares: 6, total: 31 }] },
      instagram: { followers: 268, posts: [{ text: 'Sunday nights under the lights.', date: new Date(Date.now() - 2 * 864e5).toISOString(), url: '#', image: 'images/soccer-player.jpg', likes: 71, comments: 5, shares: 0, total: 76 }] } } },
    clarity: { status: 'ok', data: { days: 3, sessions: 141, people: 118, scrollDepth: 46, activeSeconds: 52, rageClicks: 3.1, deadClicks: 18.4, quickBacks: 6.2 } },
    forms: { status: 'ok', data: [{ name: 'newsletter', value: 23 }, { name: 'contact', value: 11 }, { name: 'app-report', value: 4 }] },
    list: { status: 'ok', data: { active: 23, newThisMonth: 9, unsubscribed: 1, unsubscribedThisMonth: 1, mail: { ready: true, postal: false, daily: 300, sentToday: 4 }, job: null } },
    orders: { status: 'ok', data: { count: 0, revenue: 0, allTime: 0, latest: [], bestSellers: [], accounts: 3, openCarts: 1 } },
  };
};
