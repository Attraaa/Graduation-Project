"""Saved outer boundary before framing, projected into the actual analysis image."""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np


def manual_mapping(grid, width, height):
    # Imported lazily; the geometry itself never calls YOLO or assigns AI confidence.
    from keyboard_mapper import KeyboardMappingResult

    if not isinstance(grid, dict) or grid.get('source') != 'manual':
        raise ValueError('invalid_manual_geometry')
    quad = np.asarray(grid.get('quad'), dtype=np.float64)
    if quad.shape != (4, 2) or not np.isfinite(quad).all() or (quad < 0).any() or (quad > 1).any():
        raise ValueError('invalid_manual_geometry')
    framing = grid.get('framing', {})
    if not isinstance(framing, dict):
        raise ValueError('invalid_manual_geometry')
    values = [framing.get('zoom', 1), framing.get('panX', 0), framing.get('panY', 0)]
    if any(type(value) not in (int, float) or not np.isfinite(value) for value in values):
        raise ValueError('invalid_manual_geometry')
    zoom, pan_x, pan_y = values
    if not 1 <= zoom <= 5 or abs(pan_x) > (zoom - 1) / 2 or abs(pan_y) > (zoom - 1) / 2:
        raise ValueError('invalid_manual_geometry')
    quad = .5 + (quad - .5) * zoom + [pan_x, pan_y]
    edges = np.roll(quad, -1, axis=0) - quad
    crosses = edges[:, 0] * np.roll(edges[:, 1], -1) - edges[:, 1] * np.roll(edges[:, 0], -1)
    area = abs(float(np.sum(quad[:, 0] * np.roll(quad[:, 1], -1) - quad[:, 1] * np.roll(quad[:, 0], -1)))) / 2
    if (crosses <= .0001).any() or area < .015:
        raise ValueError('invalid_manual_geometry')
    turns = grid.get('turns', 0)
    flip_x, flip_y = grid.get('flipX', False), grid.get('flipY', False)
    if type(turns) is not int or turns not in range(4) or type(flip_x) is not bool or type(flip_y) is not bool:
        raise ValueError('invalid_manual_direction')
    with (Path(__file__).resolve().parent.parent / 'data' / 'perfect_map.json').open(encoding='utf-8') as file:
        keys = json.load(file)['keys']
    all_points = np.asarray([p for poly in keys.values() for p in poly], dtype=np.float32)
    minimum, span = all_points.min(axis=0), np.ptp(all_points, axis=0)
    transform = cv2.getPerspectiveTransform(np.float32([[0, 0], [1, 0], [1, 1], [0, 1]]), (quad * [width, height]).astype(np.float32))
    polygons = {}
    for name, poly in keys.items():
        points = (np.asarray(poly, dtype=np.float32) - minimum) / span
        if flip_x: points[:, 0] = 1 - points[:, 0]
        if flip_y: points[:, 1] = 1 - points[:, 1]
        for _ in range(turns): points = np.column_stack((1 - points[:, 1], points[:, 0]))
        polygons[name] = cv2.perspectiveTransform(points.reshape(-1, 1, 2), transform).reshape(-1, 2)
    return KeyboardMappingResult(ok=True, state='mapped', reason=None, keys=polygons,
                                 source='manual', geometry_validated=True, quality={'area_ratio': area})
