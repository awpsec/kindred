"""Approved Kindred team-shadows geometry; expressions and proportions are fixed."""

def scene(spec,dark=False,eyes=True,shadows=True,small=False,tiny=False):
    mode='dark' if dark else 'light'
    prefix='team-d' if dark else 'team-l'
    definitions=[];cast=[];heads=[]
    for i,bot in enumerate(spec['bots']):
        palette=bot[mode]
        shade=palette['shadow']
        cast.append(f'<path d="{bot["shadow_path"]}" fill="{shade}"/>')
        head=f'<path d="{bot["head_path"]}" fill="{palette["head"]}"/>'
        if eyes:
            head+=bot['eyes']
        heads.append(f'<g transform="{bot.get("head_transform", "")}">{head}</g>')
    order=spec.get('shadow_order',[0,1,2])
    projected=''
    if shadows and not tiny:
        palette=spec[mode]
        opacity=palette.get('small_shadow_opacity',.50 if dark else .38) if small else palette['shadow_opacity']
        end_opacity=opacity if small else palette['shadow_end_opacity']
        definitions.append(f'<linearGradient id="{prefix}-opacity" gradientUnits="userSpaceOnUse" x1="0" y1="35" x2="0" y2="104"><stop stop-color="white" stop-opacity="{opacity}"/><stop offset="1" stop-color="white" stop-opacity="{end_opacity}"/></linearGradient><mask id="{prefix}-fade" maskUnits="userSpaceOnUse" x="-20" y="0" width="140" height="130"><rect x="-20" width="140" height="130" fill="url(#{prefix}-opacity)"/></mask>')
        shapes=''.join(cast[i] for i in order)
        if small:
            projected=f'<g mask="url(#{prefix}-fade)">{shapes}</g>'
        else:
            definitions.append(f'<filter id="{prefix}-blur" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur stdDeviation="{spec.get("penumbra_blur",1.75)}"/></filter><linearGradient id="{prefix}-sharp-grad" gradientUnits="userSpaceOnUse" x1="0" y1="45" x2="0" y2="85"><stop stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient><linearGradient id="{prefix}-soft-grad" gradientUnits="userSpaceOnUse" x1="0" y1="45" x2="0" y2="85"><stop stop-color="black"/><stop offset="1" stop-color="white"/></linearGradient><mask id="{prefix}-sharp" maskUnits="userSpaceOnUse" x="-20" y="0" width="140" height="130"><rect x="-20" width="140" height="130" fill="url(#{prefix}-sharp-grad)"/></mask><mask id="{prefix}-soft" maskUnits="userSpaceOnUse" x="-20" y="0" width="140" height="130"><rect x="-20" width="140" height="130" fill="url(#{prefix}-soft-grad)"/></mask>')
            projected=f'<g mask="url(#{prefix}-fade)"><g mask="url(#{prefix}-sharp)">{shapes}</g><g mask="url(#{prefix}-soft)"><g filter="url(#{prefix}-blur)">{shapes}</g></g></g>'
    figures=''.join(heads)
    if tiny:figures='<g transform="translate(-3.5 26) scale(1.07)">'+figures+'</g>'
    return '<defs>'+''.join(definitions)+'</defs>'+projected+figures

def tile(spec,dark=False,masked=True,eyes=True,small=False,tiny=False):
    palette=spec['dark'] if dark else spec['light']
    ident='team-dark-background' if dark else 'team-light-background'
    radius=' rx="224"' if masked else ''
    background=f'<defs><linearGradient id="{ident}" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="{palette["bg"]}"/><stop offset="1" stop-color="{palette["end"]}"/></linearGradient></defs><rect width="1024" height="1024"{radius} fill="url(#{ident})"/>'
    pool=f'{ident}-pool'
    background+=f'<defs><radialGradient id="{pool}" cx="50%" cy="{palette.get("pool_y",26)}%" r="{palette.get("pool_r",48)}%"><stop stop-color="{palette["pool"]}" stop-opacity="{palette["pool_opacity"]}"/><stop offset="1" stop-color="{palette["pool"]}" stop-opacity="0"/></radialGradient></defs><rect width="1024" height="1024"{radius} fill="url(#{pool})"/>'
    clip='team-dark-clip' if dark else 'team-light-clip'
    return background+f'<defs><clipPath id="{clip}"><rect width="1024" height="1024"{radius}/></clipPath></defs><g clip-path="url(#{clip})"><g transform="scale(10.24)">{scene(spec,dark,eyes,small=small,tiny=tiny)}</g></g>'
