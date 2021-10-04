import ssh from '../../../lib/server/ssh'
import prisma from '../../../lib/server/db'
import getSession from '../../../lib/server/session'
import axios from 'axios'

export default async function (req, res) {
	try {
		let { id: accountId } = await getSession(req, res)

		if (req.method === 'GET') {
			let { code, state } = req.query
			let { host } = req.headers

			if (!host) return res.status(409).send()

			if (!code) return res.status(400).send()

			if (!state) return res.redirect('/settings')

			let [action, stateAccountId] = state.split(':')
			if (accountId !== stateAccountId) return res.status(404).send()

			if (action == 'gh_init') {
				let { data } = await axios.post(`https://api.github.com/app-manifests/${code}/conversions`)
				let { client_id, client_secret } = data

				await prisma.accounts.update({
					where: {
						id: accountId,
					},
					data: {
						tokens: {
							github: {
								setup: data,
								granted: Date.now(),
							},
						},
					},
				})

				res.redirect(
					`https://github.com/login/oauth/authorize?client_id=${client_id}&redirect_uri=http://${host}/api/github/connect&scope=repo%20read:user&allow_signup=false&state=gh_authorize:${accountId}`
				)

				await ssh('dokku', ['config:set', 'admin', `GH_CLIENT_ID=${client_id}`, `GH_CLIENT_SECRET=${client_secret}`])

				return
			}

			if (action == 'gh_authorize') {
				let setup_data = await prisma.accounts.findUnique({
					where: {
						id: accountId,
					},
				})

				let { tokens } = setup_data

				let { data } = await axios.post(
					`https://github.com/login/oauth/access_token`,
					{
						client_id: (tokens as any).github.setup.client_id,
						client_secret: (tokens as any).github.setup.client_secret,
						redirect_uri: `http://${host}/api/github/connect`,
						code: code,
					},
					{
						headers: {
							Accept: 'application/json',
						},
					}
				)

				await prisma.accounts.update({
					where: {
						id: accountId,
					},
					data: {
						tokens: {
							github: {
								...data,
								granted: Date.now(),
							},
						},
					},
				})
				res.redirect(`https://github.com/apps/${(tokens as any).github.setup.slug}/installations/new`)
			}

			res.redirect('/settings')
		} else {
			return res.status(405).send()
		}
	} catch (e) {
		if (typeof e == 'undefined') return e
		res.status(500).send()
	}
}
