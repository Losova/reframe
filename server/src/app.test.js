import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOwnerUrl,
  buildPlaybackUrl,
  buildProjectResponse,
  deriveProjectTitle,
  normalizeProjectTitle
} from './app.js';

const runtimeConfig = {
  bucketName: 'translate-videos',
  supabaseUrl: 'https://example.supabase.co'
};

const localRuntimeConfig = {
  appBaseUrl: 'http://127.0.0.1:37817',
  storageMode: 'local'
};

test('buildProjectResponse adds a share URL without mutating core project fields', () => {
  const request = {
    get(header) {
      if (header === 'host') {
        return 'localhost:3001';
      }

      return undefined;
    },
    protocol: 'http'
  };

  const project = {
    ownerToken: 'do-not-return-this',
    playbackPath: 'videos/shot-010.mp4',
    shareId: '11111111-1111-4111-8111-111111111111',
    title: 'Shot 010 Lighting Pass'
  };

  const response = buildProjectResponse(project, request, runtimeConfig);

  assert.equal(response.title, 'Shot 010 Lighting Pass');
  assert.equal(response.playbackPath, 'videos/shot-010.mp4');
  assert.equal(response.ownerToken, undefined);
  assert.equal(
    response.playbackUrl,
    'https://example.supabase.co/storage/v1/object/public/translate-videos/videos/shot-010.mp4'
  );
  assert.equal(
    response.shareUrl,
    'http://localhost:3001/v/11111111-1111-4111-8111-111111111111'
  );
});

test('buildOwnerUrl creates an animator workspace URL with the owner token', () => {
  const request = {
    get(header) {
      if (header === 'host') {
        return 'localhost:3001';
      }

      return undefined;
    },
    protocol: 'http'
  };

  assert.equal(
    buildOwnerUrl(
      request,
      '11111111-1111-4111-8111-111111111111',
      'owner-token'
    ),
    'http://localhost:3001/o/11111111-1111-4111-8111-111111111111/owner-token'
  );
});

test('buildPlaybackUrl creates a public storage URL for the playback asset', () => {
  assert.equal(
    buildPlaybackUrl('videos/review clip.mp4', runtimeConfig),
    'https://example.supabase.co/storage/v1/object/public/translate-videos/videos/review%20clip.mp4'
  );
});

test('buildPlaybackUrl creates a local media URL in desktop mode', () => {
  assert.equal(
    buildPlaybackUrl('videos/review clip.mp4', localRuntimeConfig),
    'http://127.0.0.1:37817/media/videos/review%20clip.mp4'
  );
});

test('deriveProjectTitle turns filenames into readable defaults', () => {
  assert.equal(
    deriveProjectTitle('shot_010-lighting-pass.mp4'),
    'shot 010 lighting pass'
  );
});

test('normalizeProjectTitle trims whitespace and falls back when empty', () => {
  assert.equal(
    normalizeProjectTitle('   Snowfall   color   pass   '),
    'Snowfall color pass'
  );
  assert.equal(normalizeProjectTitle('   ', 'Untitled Review'), 'Untitled Review');
});
