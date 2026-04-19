export function createTransactionCard(transaction, currencyFormatter, onDelete) {
  const card = document.createElement('article');
  card.className = `transaction-card ${transaction.type}`;

  const dot = document.createElement('div');
  dot.className = 'transaction-dot';

  const info = document.createElement('div');
  info.style.minWidth = '0';
  
  const title = document.createElement('strong');
  title.style.display = 'block';
  title.style.whiteSpace = 'nowrap';
  title.style.overflow = 'hidden';
  title.style.textOverflow = 'ellipsis';
  title.textContent = transaction.description;

  const meta = document.createElement('div');
  meta.className = 'transaction-meta';
  meta.style.whiteSpace = 'nowrap';
  meta.style.overflow = 'hidden';
  meta.style.textOverflow = 'ellipsis';
  meta.textContent = `${transaction.category} • ${new Date(transaction.date).toLocaleDateString()}`;

  info.append(title, meta);

  const amount = document.createElement('div');
  amount.className = 'transaction-amount';
  amount.textContent = `${transaction.type === 'expense' ? '-' : '+'}${currencyFormatter.format(
    Number(transaction.amount)
  )}`;

  const deleteStrip = document.createElement('button');
  deleteStrip.type = 'button';
  deleteStrip.className = 'delete-strip';
  deleteStrip.textContent = 'Delete';
  deleteStrip.addEventListener('click', () => onDelete(transaction.id));

  card.append(dot, info, amount, deleteStrip);
  bindSwipe(card, deleteStrip);
  return card;
}

function bindSwipe(card, deleteStrip) {
  let startX = 0;
  let currentX = 0;
  let dragging = false;

  const onPointerMove = (event) => {
    if (!dragging) {
      return;
    }

    currentX = event.clientX;
    const delta = Math.min(0, currentX - startX);
    card.style.transform = `translateX(${Math.max(delta, -88)}px)`;
  };

  const onPointerUp = () => {
    if (!dragging) {
      return;
    }

    dragging = false;
    const delta = currentX - startX;
    card.style.transform = delta < -70 ? 'translateX(-88px)' : 'translateX(0)';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  card.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && window.innerWidth > 920) {
      return;
    }

    dragging = true;
    startX = event.clientX;
    currentX = event.clientX;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });

  deleteStrip.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
}
