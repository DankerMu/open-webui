from open_webui.models.config import Config

# Official sizes per aspect ratio for generate_image (#690). An admin replaces the table by
# storing `aspect_ratio_sizes` in IMAGES_OPENAI_API_PARAMS; storing {} turns selection off.
ASPECT_RATIO_SIZES = {
    '1:1': '2048x2048',
    '4:3': '2400x1792',
    '3:4': '1792x2400',
    '3:2': '2528x1696',
    '2:3': '1696x2528',
    '16:9': '2752x1536',
    '9:16': '1536x2752',
}


def get_aspect_ratio_sizes(params) -> dict:
    if not isinstance(params, dict) or 'aspect_ratio_sizes' not in params:
        return dict(ASPECT_RATIO_SIZES)
    sizes = params['aspect_ratio_sizes']
    return sizes if isinstance(sizes, dict) else {}


def with_aspect_ratio_preset(values: dict) -> dict:
    # Show the preset so an admin can edit it; tested by key, since a stored {} means off.
    params = values.get('IMAGES_OPENAI_API_PARAMS')
    if isinstance(params, dict) and 'aspect_ratio_sizes' not in params:
        values['IMAGES_OPENAI_API_PARAMS'] = {**params, 'aspect_ratio_sizes': get_aspect_ratio_sizes(params)}
    return values


def openai_request_params(params, size: str | None) -> dict:
    # The ratio table is WebUI config; it never reaches the service or file metadata.
    # The size chosen for this call beats a params size.
    request_params = {k: v for k, v in params.items() if k != 'aspect_ratio_sizes'} if params else {}
    return {**request_params, **({'size': size} if size else {})}


async def resolve_aspect_ratio_size(aspect_ratio: str | None) -> tuple[str | None, str | None]:
    """Return (size, error) for a generate_image call; size None leaves the configured default."""
    aspect_ratio = (aspect_ratio or '').strip()
    if not aspect_ratio:
        return None, None
    config = await Config.get_many('image_generation.engine', 'image_generation.openai.params')
    if config.get('image_generation.engine') != 'openai':
        return None, None
    sizes = get_aspect_ratio_sizes(config.get('image_generation.openai.params'))
    if sizes and aspect_ratio not in sizes:
        return None, f'Unsupported aspect_ratio {aspect_ratio!r}; valid ratios: {", ".join(sizes)}'
    return sizes.get(aspect_ratio), None
