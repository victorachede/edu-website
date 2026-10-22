# Realistic characters (Mixamo)

Characters and animations are loaded at runtime from this folder (or from `VITE_MODELS_BASE`).
They are **not committed** to git (see `.gitignore`): Mixamo's terms allow using its characters and
animations inside a project, but not redistributing them as stand-alone files, and this repo is public.

## Add characters

1. Go to https://www.mixamo.com (free Adobe account).
2. Pick a character (Characters tab). Download as **FBX Binary (.fbx)**, **T-pose**, with skin.
   Save as `public/models/characters/<name>.fbx`.
3. Pick animations (Animations tab) with any character selected: **Idle**, **Walking**, **Running**.
   Tick **In Place** for walking and running. Download as **FBX Binary**, **Without Skin**.
   Save as `public/models/anims/idle.fbx`, `walk.fbx`, `run.fbx`.
4. Copy `manifest.example.json` to `manifest.json` and list your characters.

All Mixamo characters share one skeleton, so the same three animations drive every character.
GLB files work too, if you convert them.

## Deploying

Because the files are not in git, host them elsewhere and point the game at them:

- Upload the whole `models` folder (including `manifest.json`) to a static host, for example Vercel Blob or Cloudflare R2.
  Allow cross-origin reads (CORS) for your site.
- Set `VITE_MODELS_BASE` to that folder's URL (no trailing slash) in your Vercel project and redeploy.

Without models the game uses the built-in custom characters.

## Notes

- Characters are scaled to about 1.75 m, times the player's height setting.
- Skin tone, hair and outfit are part of each Mixamo model. Players choose a model, then a name and height.
- Check Mixamo's current licence terms before launch, especially for paid products.
