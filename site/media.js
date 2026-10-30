export const groups = Array.from({ length: 4 }, (_, group) => ({
  id: `group-${group + 1}`,
  label: `Группа ${String(group + 1).padStart(2, '0')}`,
  videos: Array.from({ length: 8 }, (_, index) => ({
    id: `clip-${group + 1}-${index + 1}`,
    src: `./videos/demo-${group + 1}.mp4`,
    poster: `./posters/demo-${group + 1}.png`,
    phase: index / 8,
    label: `Видео ${String(index + 1).padStart(2, '0')}, группа ${group + 1}`,
    related: Array.from({ length: 4 + index % 5 }, (_, relatedIndex) => ({
      id: `clip-${group + 1}-${index + 1}-related-${relatedIndex + 1}`,
      src: `./videos/demo-${group + 1}.mp4`,
      poster: `./posters/demo-${group + 1}.png`,
      phase: relatedIndex / (4 + index % 5),
      label: `Связанное видео ${String(relatedIndex + 1).padStart(2, '0')}`,
    })),
  })),
}));
