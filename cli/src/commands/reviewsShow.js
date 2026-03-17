import ora from 'ora';
import chalk from 'chalk';
import { ApiClient } from '../api/client.js';
import { formatReviewDetail } from '../utils/formatter.js';

/**
 * Handler de la commande `polycheck reviews show <id>`
 * @param {string} id
 * @param {object} options
 */
export async function handleReviewsShow(id, options) {
    const apiUrl = options.parent?.opts().apiUrl || process.env.POLYCHECK_API_URL || 'http://localhost:3001';
    const client = new ApiClient(apiUrl);

    if (!id) {
        console.error(chalk.red('✗ Veuillez spécifier l\'ID de la review.'));
        console.error(chalk.dim('  Usage : polycheck reviews show <id>'));
        process.exit(1);
    }

    const spinner = ora({ text: 'Chargement de la review…', spinner: 'dots' }).start();

    try {
        const data = await client.getReview(id);
        spinner.succeed('Review chargée.');
        console.log(formatReviewDetail(data));
    } catch (err) {
        spinner.fail('Échec du chargement.');
        console.error(chalk.red(`\n  ${err.message}`));
        process.exit(1);
    }
}
