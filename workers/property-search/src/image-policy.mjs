// Disabled unless a positive preparation budget is deliberately configured.
// Queue producers need no Images binding; execution additionally requires one.
export const imagePreparationEnabled = env => (Number.parseInt(env.IMAGE_TRANSFORM_LIMIT,10)||0)>0;
