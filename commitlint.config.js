// Commit format: see the Git section of CLAUDE.md.
export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        // Every body line is one bullet: four spaces, then "- ".
        'body-bullets': ({ body }) => {
          const bad = (body ?? '').split('\n').filter((line) => line.trim() !== '' && !/^ {4}- \S/.test(line));
          return [bad.length === 0, `body lines must be bullets indented four spaces ("    - "): ${bad.join(' | ')}`];
        },
      },
    },
  ],
  rules: {
    'body-bullets': [2, 'always'],
  },
};
