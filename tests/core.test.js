// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/core.js');

const VERITASIUM = { id: 'UCHnyfMqiRRG1u-2MsSQLbXA', handle: 'veritasium', name: 'Veritasium' };

test('channelFromHref reads handles and channel IDs', () => {
  assert.deepEqual(C.channelFromHref('/@Veritasium/videos'), { id: '', handle: 'veritasium' });
  assert.deepEqual(C.channelFromHref('https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA'), {
    id: 'UCHnyfMqiRRG1u-2MsSQLbXA',
    handle: '',
  });
  assert.deepEqual(C.channelFromHref('/@%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4'), { id: '', handle: 'भारत' });
  assert.equal(C.channelFromHref('/watch?v=abc'), null);
  assert.equal(C.channelFromHref('https://example.com/@someone'), null);
});

test('isSafelisted matches on ID, handle, or name when IDs cannot decide', () => {
  const index = C.buildIndex([VERITASIUM]);
  assert.ok(C.isSafelisted(index, { id: VERITASIUM.id }));
  assert.ok(C.isSafelisted(index, { handle: '@VERITASIUM' }));
  assert.ok(C.isSafelisted(index, { name: '  veritasium ' }), 'sidebar tiles may only have a name');
  assert.ok(!C.isSafelisted(index, { id: 'UCxxxxxxxxxxxxxxxxxxxxxx', name: 'Veritasium' }), 'same name, different ID');
  assert.ok(!C.isSafelisted(index, { handle: 'impostor', name: 'Veritasium' }), 'same name, different handle');
  assert.ok(!C.isSafelisted(index, { name: 'Someone else' }));
  assert.ok(!C.isSafelisted(index, { id: '', handle: '', name: '' }));
});

test('a handle-only entry still matches tiles that know the ID', () => {
  const index = C.buildIndex([{ id: '', handle: 'veritasium', name: 'Veritasium' }]);
  assert.ok(C.isSafelisted(index, { id: VERITASIUM.id, handle: 'veritasium' }));
  assert.ok(C.isSafelisted(index, { id: VERITASIUM.id, name: 'Veritasium' }));
});

test('channelKey prefers ID, then handle, then name', () => {
  assert.equal(C.channelKey(VERITASIUM), 'ch:' + VERITASIUM.id);
  assert.equal(C.channelKey({ handle: '@Veritasium' }), 'ch:@veritasium');
  assert.equal(C.channelKey({ name: 'Some  Name' }), 'ch:n:some name');
});

test('findEntry returns the stored channel', () => {
  const list = [{ key: 'a', ...VERITASIUM }, { key: 'b', id: '', handle: 'mkbhd', name: 'Marques Brownlee' }];
  assert.equal(C.findEntry(list, { id: VERITASIUM.id }).key, 'a');
  assert.equal(C.findEntry(list, { handle: 'MKBHD' }).key, 'b');
  assert.equal(C.findEntry(list, { name: 'marques brownlee' }).key, 'b');
  assert.equal(C.findEntry(list, { name: 'nobody' }), null);
});

test('parseChannelInput understands the usual things people paste', () => {
  assert.deepEqual(C.parseChannelInput('@Veritasium'), {
    kind: 'channel',
    id: '',
    handle: 'veritasium',
    url: 'https://www.youtube.com/@veritasium',
  });
  assert.equal(C.parseChannelInput('veritasium').handle, 'veritasium');
  assert.equal(C.parseChannelInput('https://www.youtube.com/@veritasium/videos').handle, 'veritasium');
  assert.equal(C.parseChannelInput('youtube.com/@veritasium').handle, 'veritasium');
  assert.equal(C.parseChannelInput('m.youtube.com/@veritasium').handle, 'veritasium');
  assert.equal(C.parseChannelInput(VERITASIUM.id).id, VERITASIUM.id);
  assert.equal(C.parseChannelInput('https://www.youtube.com/channel/' + VERITASIUM.id + '/about').id, VERITASIUM.id);
  assert.deepEqual(C.parseChannelInput('https://youtu.be/dQw4w9WgXcQ?t=5'), {
    kind: 'video',
    id: '',
    handle: '',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  });
  assert.equal(C.parseChannelInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x').kind, 'video');
  assert.equal(C.parseChannelInput('https://www.youtube.com/shorts/dQw4w9WgXcQ').kind, 'video');
  assert.equal(C.parseChannelInput('https://www.youtube.com/c/SomeName').url, 'https://www.youtube.com/c/SomeName');
  assert.equal(C.parseChannelInput('https://example.com/@x'), null);
  assert.equal(C.parseChannelInput(''), null);
});

test('parseYouTubePage pulls channel details from a channel page', () => {
  const html = `<html><head>
    <meta property="og:title" content="Tom &amp; Jerry&#39;s">
    <meta property="og:image" content="https://yt3.googleusercontent.com/abc=s900">
    <link rel="canonical" href="https://www.youtube.com/channel/${VERITASIUM.id}">
    </head><script>var x = {"vanityChannelUrl":"http://www.youtube.com/@TomAndJerry"};</script></html>`;
  assert.deepEqual(C.parseYouTubePage(html, 'channel'), {
    id: VERITASIUM.id,
    handle: 'tomandjerry',
    name: "Tom & Jerry's",
    avatar: 'https://yt3.googleusercontent.com/abc=s900',
  });
});

test('parseYouTubePage pulls the channel from a watch page', () => {
  const html = `{"channelId":"UCaaaaaaaaaaaaaaaaaaaaaa"} ... "videoDetails":{"videoId":"x","title":"t","channelId":"${VERITASIUM.id}","author":"Veritasium \\u0026 Co"}
    "ownerProfileUrl":"http://www.youtube.com/@veritasium"`;
  const out = C.parseYouTubePage(html, 'video');
  assert.equal(out.id, VERITASIUM.id, 'uses the channel from videoDetails, not the first one on the page');
  assert.equal(out.name, 'Veritasium & Co');
  assert.equal(out.handle, 'veritasium');
});

test('parseChannelVideos reads uploads from a channel Videos tab', () => {
  const lockup = (id, title, ago) => ({
    richItemRenderer: {
      content: {
        lockupViewModel: {
          contentId: id,
          contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
          contentImage: {
            thumbnailViewModel: {
              image: { sources: [{ url: 'https://i.ytimg.com/vi/x/hq.jpg' }] },
              overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: '1:25:47' } }] } }],
            },
          },
          metadata: {
            lockupMetadataViewModel: {
              title: { content: title },
              metadata: {
                contentMetadataViewModel: {
                  metadataRows: [
                    { metadataParts: [{ text: { content: '1M' }, accessibilityLabel: '1 million views' }, ago && { text: { content: 'x' }, accessibilityLabel: ago }].filter(Boolean) },
                  ],
                },
              },
            },
          },
        },
      },
    },
  });
  const data = {
    metadata: {
      channelMetadataRenderer: {
        title: 'Veritasium',
        externalId: VERITASIUM.id,
        vanityChannelUrl: 'http://www.youtube.com/@veritasium',
        avatar: { thumbnails: [{ url: 'https://yt3.example/small' }, { url: 'https://yt3.example/big' }] },
      },
    },
    contents: [
      lockup('aaaaaaaaaaa', 'Newest', '2 days ago'),
      lockup('bbbbbbbbbbb', 'Older', '2 days ago'),
      lockup('ccccccccccc', 'Premiere', null),
      {
        videoRenderer: {
          videoId: 'ddddddddddd',
          title: { runs: [{ text: 'Old format' }] },
          publishedTimeText: { simpleText: '3 weeks ago' },
          shortViewCountText: { simpleText: '2.1M views' },
          lengthText: { simpleText: '12:04' },
        },
      },
    ],
  };
  const html = `<script>var ytInitialData = ${JSON.stringify(data)};</script><script>more</script>`;
  const now = Date.UTC(2026, 10, 2);
  const out = C.parseChannelVideos(html, now);
  assert.deepEqual(out.channel, { id: VERITASIUM.id, name: 'Veritasium', handle: 'veritasium', avatar: 'https://yt3.example/big' });
  assert.deepEqual(out.items.map((i) => i.vid), ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ddddddddddd'], 'premieres are skipped');
  assert.ok(out.items[0].published > out.items[1].published, 'page order breaks ties');
  assert.equal(out.items[0].views, '1M views');
  assert.equal(out.items[0].duration, '1:25:47', 'duration comes from the thumbnail badge');
  assert.equal(out.items[2].title, 'Old format');
  assert.equal(out.items[2].views, '2.1M views');
  assert.equal(out.items[2].duration, '12:04');
  assert.equal(C.parseChannelVideos('<html>no data</html>'), null);
});

test('agoToTime', () => {
  const now = 1_000_000_000_000;
  assert.equal(C.agoToTime('3 days ago', now), now - 3 * 86400000);
  assert.equal(C.agoToTime('Streamed 1 hour ago', now), now - 3600000);
  assert.equal(C.agoToTime('Premieres tomorrow', now), 0);
});

test('schedule windows, including overnight ones', () => {
  const weekdays = { enabled: true, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' };
  const at = (day, h, m = 0) => new Date(2026, 10, 1 + day, h, m); // 1 Nov 2026 is a Sunday
  assert.ok(C.inSchedule(weekdays, at(1, 9, 0)));
  assert.ok(C.inSchedule(weekdays, at(5, 17, 59)));
  assert.ok(!C.inSchedule(weekdays, at(1, 18, 0)));
  assert.ok(!C.inSchedule(weekdays, at(6, 12)));

  const night = { enabled: true, days: [5], start: '22:00', end: '02:00' }; // Friday night
  assert.ok(C.inSchedule(night, at(5, 23)));
  assert.ok(C.inSchedule(night, at(6, 1, 30)), 'early Saturday belongs to Friday night');
  assert.ok(!C.inSchedule(night, at(6, 23)));
});

test('focusState combines on/off, pause and schedule', () => {
  const base = C.mergeSettings();
  const now = new Date(2026, 10, 2, 12); // Monday noon
  assert.deepEqual(C.focusState(base, now), { on: true, paused: false, inHours: true, active: true, shortsBlocked: true });

  const paused = C.mergeSettings({ pausedUntil: now.getTime() + 60000 });
  assert.equal(C.focusState(paused, now).active, false);
  assert.equal(C.focusState(paused, now).shortsBlocked, false);

  const evening = C.mergeSettings({ schedule: { enabled: true } });
  const st = C.focusState(evening, new Date(2026, 10, 2, 20));
  assert.equal(st.active, false);
  assert.equal(st.shortsBlocked, true, 'Shorts stay blocked outside hours by default');
  const st2 = C.focusState(C.mergeSettings({ schedule: { enabled: true }, shortsAlways: false }), new Date(2026, 10, 2, 20));
  assert.equal(st2.shortsBlocked, false);

  assert.equal(C.focusState(C.mergeSettings({ enabled: false }), now).shortsBlocked, false);
});

test('mergeSettings keeps nested defaults', () => {
  const s = C.mergeSettings({ schedule: { start: '10:00' }, lock: { mode: 'none' } });
  assert.equal(s.schedule.end, '18:00');
  assert.equal(s.schedule.start, '10:00');
  assert.equal(s.lock.seconds, 60);
  assert.equal(s.lock.mode, 'none');
});

test('migrateSettings drops the old default countdown once', () => {
  const old = { enabled: true, lock: { mode: 'wait', seconds: 60, phrase: 'x' } };
  const migrated = C.migrateSettings(old);
  assert.equal(migrated.lock.mode, 'none');
  assert.equal(migrated.lock.phrase, 'x');
  assert.equal(migrated.enabled, true);
  assert.equal(C.migrateSettings(migrated), null, 'runs only once');

  // A countdown the user chose after upgrading is respected.
  assert.equal(C.migrateSettings({ ...migrated, lock: { mode: 'wait', seconds: 60 } }), null);
  // Non-default choices made before upgrading are kept.
  assert.equal(C.migrateSettings({ lock: { mode: 'wait', seconds: 120 } }).lock.mode, 'wait');
  assert.equal(C.migrateSettings({ lock: { mode: 'phrase', seconds: 60 } }).lock.mode, 'phrase');
  assert.equal(C.migrateSettings(undefined), null);
  assert.equal(C.mergeSettings().lock.mode, 'none', 'new installs have no countdown');
});

test('formatting helpers', () => {
  assert.equal(C.formatDuration(0), '0m');
  assert.equal(C.formatDuration(30), '<1m');
  assert.equal(C.formatDuration(125), '2m');
  assert.equal(C.formatDuration(3900), '1h 05m');
  assert.equal(C.timeAgo(Date.now() - 3 * 86400000), '3 days ago');
  assert.equal(C.timeAgo(Date.now()), 'just now');
  assert.equal(C.daysLabel([1, 2, 3, 4, 5]), 'Weekdays');
  assert.equal(C.daysLabel([6, 1, 0]), 'Mon, Sat, Sun');
  assert.equal(C.dayKey(new Date(2026, 0, 5)), '2026-01-05');
});
