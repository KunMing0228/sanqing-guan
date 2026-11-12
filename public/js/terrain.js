/**
 * 地形高度 + 殿内判定 + 碰撞解算。
 *
 * 三清像前的须弥低台：x ±8, z -24.9..-15.9，台面 y=0.35；
 * 台前 -15.9..-14.6 是斜坡，平滑过渡。蒲团区 z >= -11 全部是平地。
 */
export const PLATFORM_Y = 0.35;
export const PLATFORM_HALF_X = 8;
export const PLATFORM_BACK_Z = -24.9;
export const PLATFORM_FRONT_Z = -15.9;
export const RAMP_END_Z = -14.6;

// 殿内范围（与 server/config.js 的 HALL_ZONE 一致，略内收一点贴墙容差）
export const HALL = { halfX: 14.3, backZ: -26.8, frontZ: 14.8 };

export function insideHall(x, z) {
  return Math.abs(x) <= HALL.halfX && z >= HALL.backZ && z <= HALL.frontZ;
}

export function groundHeight(x, z) {
  if (Math.abs(x) <= PLATFORM_HALF_X && z >= PLATFORM_BACK_Z && z <= PLATFORM_FRONT_Z) {
    return PLATFORM_Y;
  }
  if (Math.abs(x) <= PLATFORM_HALF_X && z > PLATFORM_FRONT_Z && z < RAMP_END_Z) {
    return PLATFORM_Y * (RAMP_END_Z - z) / (RAMP_END_Z - PLATFORM_FRONT_Z);
  }
  return 0;
}

/**
 * 把「想去的坐标」修正成「能站住的坐标」。
 * 做法：先按盒体（墙 / 供案 / 神像区）在最小穿透轴上推出，再按圆柱（柱子）径向推出。
 * 一次解算就够用：墙体都是轴对齐的，不会出现来回弹的抖动。
 */
export function resolveCollision(nx, nz, colliders, radius = 0.55) {
  if (!colliders) return { x: nx, z: nz };
  let x = nx, z = nz;

  for (const b of (colliders.boxes || [])) {
    const x0 = b.x0 - radius, x1 = b.x1 + radius;
    const z0 = b.z0 - radius, z1 = b.z1 + radius;
    if (x <= x0 || x >= x1 || z <= z0 || z >= z1) continue;
    // 落在扩展盒内：沿穿透最浅的一侧推出
    const dxL = x - x0, dxR = x1 - x;
    const dzB = z - z0, dzF = z1 - z;
    const m = Math.min(dxL, dxR, dzB, dzF);
    if (m === dxL) x = x0;
    else if (m === dxR) x = x1;
    else if (m === dzB) z = z0;
    else z = z1;
  }

  for (const c of (colliders.circles || [])) {
    const dx = x - c.x, dz = z - c.z;
    const min = (c.r || .6) + radius;
    const d = Math.hypot(dx, dz);
    if (d >= min) continue;
    if (d < 1e-4) { x = c.x + min; continue; }
    x = c.x + (dx / d) * min;
    z = c.z + (dz / d) * min;
  }

  return { x, z };
}

/** 三清像在 -Z 方向；打坐 / 叩拜 / 稽首一律面朝这个方向 */
export const DEITY_FACING = Math.PI;
