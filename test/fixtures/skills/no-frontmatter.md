# No frontmatter

This file intentionally has no `---` YAML frontmatter at the top. The
patcher must refuse to touch it: `patchSkill` returns `changed: false`
with reason "no frontmatter: ..." and the verifier reports an error.

The patcher's safety guarantee is that it will not invent a frontmatter
delimiter out of thin air, and it will not crash on a malformed skill.

## Section

Some content.
